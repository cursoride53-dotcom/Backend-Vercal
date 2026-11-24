"use strict";

const mongoose = require("mongoose");
const Branch = require("../models/Branch");
const Employee = require("../models/Employee");
const WorkTask = require("../models/WorkTask");

const clean = (value) => String(value ?? "").trim();

const getActorId = (req) =>
  req.user?.superAdminId ||
  req.user?._id ||
  req.user?.uid ||
  null;

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const validId = (id) => mongoose.isValidObjectId(id);

function employeeName(employee) {
  return employee?.fullName || employee?.name || "Unnamed employee";
}

function managerId(branch) {
  return (
    branch?.branchManagerEmployeeId?._id ||
    branch?.branchManagerEmployeeId ||
    null
  );
}

function hrId(branch) {
  return branch?.hrEmployeeId?._id || branch?.hrEmployeeId || null;
}

function validateBranchPayload(body, partial = false) {
  const requiredFields = [
    "branchName",
    "branchCode",
    "address",
    "city",
    "state",
    "pincode",
  ];

  if (!partial) {
    for (const field of requiredFields) {
      if (!clean(body[field])) {
        return `${field} is required.`;
      }
    }
  }

  if (
    body.pincode !== undefined &&
    !/^\d{6}$/.test(clean(body.pincode))
  ) {
    return "Pincode must contain exactly 6 digits.";
  }

  if (
    body.status !== undefined &&
    !["ACTIVE", "INACTIVE"].includes(clean(body.status).toUpperCase())
  ) {
    return "Status must be ACTIVE or INACTIVE.";
  }

  const geo = body.geofence;

  if (geo && typeof geo === "object") {
    if (
      geo.latitude !== undefined &&
      geo.latitude !== null &&
      geo.latitude !== "" &&
      (!Number.isFinite(Number(geo.latitude)) ||
        Number(geo.latitude) < -90 ||
        Number(geo.latitude) > 90)
    ) {
      return "Latitude must be between -90 and 90.";
    }

    if (
      geo.longitude !== undefined &&
      geo.longitude !== null &&
      geo.longitude !== "" &&
      (!Number.isFinite(Number(geo.longitude)) ||
        Number(geo.longitude) < -180 ||
        Number(geo.longitude) > 180)
    ) {
      return "Longitude must be between -180 and 180.";
    }

    if (
      geo.radiusMeters !== undefined &&
      (!Number.isFinite(Number(geo.radiusMeters)) ||
        Number(geo.radiusMeters) < 1 ||
        Number(geo.radiusMeters) > 100000)
    ) {
      return "Geofence radius must be between 1 and 100000 meters.";
    }
  }

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

  for (const field of [
    "startTime",
    "endTime",
    "breakStartTime",
    "breakEndTime",
  ]) {
    const value = body.workingHours?.[field];

    if (value !== undefined && !timePattern.test(String(value))) {
      return `${field} must use HH:mm format.`;
    }
  }

  if (body.workingHours?.workingDays !== undefined) {
    const allowedDays = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];

    if (
      !Array.isArray(body.workingHours.workingDays) ||
      body.workingHours.workingDays.some(
        (day) => !allowedDays.includes(day)
      )
    ) {
      return "Invalid working days.";
    }
  }

  return null;
}

function normalizePayload(body, existing = {}) {
  const payload = {};

  const textFields = [
    "branchName",
    "branchCode",
    "address",
    "city",
    "state",
    "pincode",
    "branchContactPhone",
  ];

  for (const field of textFields) {
    if (body[field] !== undefined) {
      payload[field] =
        field === "branchCode"
          ? clean(body[field]).toUpperCase()
          : clean(body[field]);
    }
  }

  if (body.status !== undefined) {
    payload.status = clean(body.status).toUpperCase();
  }

  if (body.geofence !== undefined) {
    payload.geofence = {
      ...(existing.geofence?.toObject?.() || existing.geofence || {}),
      ...body.geofence,
    };

    for (const field of ["latitude", "longitude", "radiusMeters"]) {
      if (payload.geofence[field] !== undefined) {
        const value = payload.geofence[field];

        payload.geofence[field] =
          value === "" || value === null ? null : Number(value);
      }
    }
  }

  if (body.workingHours !== undefined) {
    payload.workingHours = {
      ...(existing.workingHours?.toObject?.() ||
        existing.workingHours ||
        {}),
      ...body.workingHours,
    };
  }

  for (const field of [
    "branchManagerEmployeeId",
    "hrEmployeeId",
  ]) {
    if (body[field] !== undefined) {
      const id = clean(body[field]);

      if (id && !validId(id)) {
        throw new Error(`Invalid ${field}.`);
      }

      payload[field] = id || null;
    }
  }

  return payload;
}

function employeeBranchFilter(branch) {
  const values = [
    clean(branch.branchName),
    clean(branch.branchCode),
  ].filter(Boolean);

  return { branch: { $in: values } };
}

async function validateAssignedEmployee(id, role, label) {
  if (!id) return null;

  const employee = await Employee.findById(id).lean();

  if (!employee) {
    const error = new Error(`${label} employee not found.`);
    error.status = 404;
    throw error;
  }

  if (
    role &&
    String(employee.systemRole || "").toUpperCase() !== role
  ) {
    const error = new Error(
      `${label} must have the ${role} role.`
    );
    error.status = 400;
    throw error;
  }

  return employee;
}

/* =========================================================
   BRANCH DETAILS, EMPLOYEES, MANAGERS, HR AND TASKS
========================================================= */

async function getBranchDetails(branches) {
  const result = {
    counts: new Map(),
    employeeLists: new Map(),
    managers: new Map(),
    hrEmployees: new Map(),
    tasks: new Map(),
    taskSummaries: new Map(),
  };

  if (!branches.length) return result;

  const managerIds = branches
    .map(managerId)
    .filter(Boolean)
    .filter((id) => validId(String(id)))
    .map(String);

  const hrIds = branches
    .map(hrId)
    .filter(Boolean)
    .filter((id) => validId(String(id)))
    .map(String);

  const branchIds = branches.map((branch) => branch._id);

  const employeeFields =
    "fullName name employeeCode email mobileNumber systemRole designationTitle department operationalTeam branch status reportingManager salary createdAt updatedAt";

  const [
    employees,
    managers,
    hrEmployees,
    taskDocuments,
  ] = await Promise.all([
    Employee.find({
      status: { $ne: "DELETED" },
      $or: branches.map(employeeBranchFilter),
    })
      .select(employeeFields)
      .sort({ fullName: 1, name: 1 })
      .lean(),

    managerIds.length
      ? Employee.find({
          _id: { $in: managerIds },
          status: { $ne: "DELETED" },
        })
          .select(employeeFields)
          .lean()
      : [],

    hrIds.length
      ? Employee.find({
          _id: { $in: hrIds },
          status: { $ne: "DELETED" },
        })
          .select(employeeFields)
          .lean()
      : [],

    WorkTask.find({
      branchId: { $in: branchIds },
    })
      .populate(
        "assigneeEmployeeId",
        "fullName employeeCode email mobileNumber systemRole designationTitle department branch status"
      )
      .populate("assignedBy", "fullName name email")
      .sort({ dueDate: 1, createdAt: -1 })
      .lean(),
  ]);

  const managerMap = new Map(
    managers.map((employee) => [
      String(employee._id),
      employee,
    ])
  );

  const hrMap = new Map(
    hrEmployees.map((employee) => [
      String(employee._id),
      employee,
    ])
  );

  const tasksByBranch = new Map();
  const tasksByEmployee = new Map();

  function serializeTask(task) {
    const dueTime = task.dueDate
      ? new Date(task.dueDate).getTime()
      : NaN;

    const status = String(
      task.status || "ASSIGNED"
    ).toUpperCase();

    const isOverdue =
      !["COMPLETED", "CANCELLED"].includes(status) &&
      Number.isFinite(dueTime) &&
      dueTime < Date.now();

    return {
      _id: task._id,
      title: task.title || "Untitled task",
      branchId: task.branchId?._id || task.branchId,
      branchName:
        task.branchName ||
        task.branchId?.branchName ||
        "",

      assigneeEmployeeId: task.assigneeEmployeeId || null,
      assignedBy: task.assignedBy || null,

      priority: task.priority || "MEDIUM",
      dueDate: task.dueDate || null,
      instructions: task.instructions || "",
      expectedDeliverable: task.expectedDeliverable || "",

      status,
      startedAt: task.startedAt || null,
      submittedAt: task.submittedAt || null,
      completedAt: task.completedAt || null,
      completionNotes: task.completionNotes || "",

      createdAt: task.createdAt || null,
      updatedAt: task.updatedAt || null,

      isOverdue,
    };
  }

  for (const task of taskDocuments) {
    const branchId = String(
      task.branchId?._id || task.branchId
    );

    const assigneeId = task.assigneeEmployeeId?._id
      ? String(task.assigneeEmployeeId._id)
      : String(task.assigneeEmployeeId || "");

    const taskData = serializeTask(task);

    if (!tasksByBranch.has(branchId)) {
      tasksByBranch.set(branchId, []);
    }

    tasksByBranch.get(branchId).push(taskData);

    if (assigneeId) {
      if (!tasksByEmployee.has(assigneeId)) {
        tasksByEmployee.set(assigneeId, []);
      }

      tasksByEmployee.get(assigneeId).push(taskData);
    }
  }

  function formatEmployee(employee) {
    if (!employee) return null;

    const salary = employee.salary || {};

    const basicPay = Number(salary.basicPay) || 0;
    const hra = Number(salary.hra) || 0;
    const conveyance = Number(salary.conveyance) || 0;
    const tdsDeduction = Number(salary.tdsDeduction) || 0;

    const grossSalary = basicPay + hra + conveyance;

    const assignedTasks =
      tasksByEmployee.get(String(employee._id)) || [];

    return {
      _id: employee._id,
      fullName: employeeName(employee),
      employeeCode: employee.employeeCode || "",
      email: employee.email || "",
      mobileNumber: employee.mobileNumber || "",

      systemRole: employee.systemRole || "EMPLOYEE",
      designationTitle: employee.designationTitle || "",
      department: employee.department || "",
      operationalTeam: employee.operationalTeam || "",

      branch: employee.branch || "",
      reportingManager: employee.reportingManager || "",
      status: employee.status || "ACTIVE",

      salary: {
        basicPay,
        hra,
        conveyance,
        tdsDeduction,
        grossSalary,
        netSalary: grossSalary - tdsDeduction,
      },

      grossSalary,
      netSalary: grossSalary - tdsDeduction,

      assignedTasks,

      taskSummary: {
        total: assignedTasks.length,
        assigned: assignedTasks.filter(
          (task) => task.status === "ASSIGNED"
        ).length,
        inProgress: assignedTasks.filter(
          (task) => task.status === "IN_PROGRESS"
        ).length,
        submitted: assignedTasks.filter(
          (task) => task.status === "SUBMITTED"
        ).length,
        completed: assignedTasks.filter(
          (task) => task.status === "COMPLETED"
        ).length,
        cancelled: assignedTasks.filter(
          (task) => task.status === "CANCELLED"
        ).length,
        overdue: assignedTasks.filter(
          (task) => task.isOverdue
        ).length,
      },

      createdAt: employee.createdAt || null,
      updatedAt: employee.updatedAt || null,
    };
  }

  for (const branch of branches) {
    const id = String(branch._id);

    const keys = [
      clean(branch.branchName).toLowerCase(),
      clean(branch.branchCode).toLowerCase(),
    ].filter(Boolean);

    const matched = employees.filter((employee) =>
      keys.includes(clean(employee.branch).toLowerCase())
    );

    const manager =
      managerMap.get(String(managerId(branch))) || null;

    const hr =
      hrMap.get(String(hrId(branch))) || null;

    const employeeMap = new Map(
      matched.map((employee) => [
        String(employee._id),
        employee,
      ])
    );

    // Include assigned manager and HR even if their branch string
    // does not match the branch code or name.
    for (const person of [manager, hr]) {
      if (person && person.status !== "DELETED") {
        employeeMap.set(String(person._id), person);
      }
    }

    const branchEmployees = Array.from(employeeMap.values())
      .filter((employee) => employee.status !== "DELETED")
      .map(formatEmployee)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const branchTasks = tasksByBranch.get(id) || [];

    result.counts.set(id, branchEmployees.length);
    result.employeeLists.set(id, branchEmployees);
    result.managers.set(id, formatEmployee(manager));
    result.hrEmployees.set(id, formatEmployee(hr));
    result.tasks.set(id, branchTasks);

    result.taskSummaries.set(id, {
      total: branchTasks.length,

      assigned: branchTasks.filter(
        (task) => task.status === "ASSIGNED"
      ).length,

      inProgress: branchTasks.filter(
        (task) => task.status === "IN_PROGRESS"
      ).length,

      submitted: branchTasks.filter(
        (task) => task.status === "SUBMITTED"
      ).length,

      completed: branchTasks.filter(
        (task) => task.status === "COMPLETED"
      ).length,

      cancelled: branchTasks.filter(
        (task) => task.status === "CANCELLED"
      ).length,

      overdue: branchTasks.filter(
        (task) => task.isOverdue
      ).length,

      highPriority: branchTasks.filter(
        (task) => ["HIGH", "URGENT"].includes(task.priority)
      ).length,
    });
  }

  return result;
}

/* =========================================================
   BRANCH SERIALIZATION
========================================================= */

function serializeBranch(
  branch,
  employeeCount = 0,
  manager = null,
  hr = null,
  employees = [],
  assignedTasks = [],
  taskSummary = {}
) {
  const item =
    typeof branch?.toObject === "function"
      ? branch.toObject()
      : branch;

  return {
    ...item,

    branchManager: manager,
    branchManagerEmployeeId:
      manager?._id || managerId(item) || null,
    branchManagerName:
      manager?.fullName || item.branchManagerName || "",

    hrEmployee: hr,
    hrEmployeeId:
      hr?._id || hrId(item) || null,
    hrEmployeeName:
      hr?.fullName || item.hrEmployeeName || "",

    employeeCount,
    employees,
    assignedTasks,
    taskSummary,
  };
}

async function serializeBranches(branches) {
  const details = await getBranchDetails(branches);

  return branches.map((branch) => {
    const id = String(branch._id);

    return serializeBranch(
      branch,
      details.counts.get(id) || 0,
      details.managers.get(id) || null,
      details.hrEmployees.get(id) || null,
      details.employeeLists.get(id) || [],
      details.tasks.get(id) || [],
      details.taskSummaries.get(id) || {}
    );
  });
}

/* =========================================================
   GET ALL BRANCHES
========================================================= */

exports.getBranches = asyncHandler(async (req, res) => {
  const {
    search = "",
    status = "ALL",
    page = "1",
    limit = "100",
  } = req.query;

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(limit, 10) || 100)
  );

  const filter = {};

  if (clean(status).toUpperCase() !== "ALL") {
    filter.status = clean(status).toUpperCase();
  }

  if (clean(search)) {
    const escaped = clean(search).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const regex = new RegExp(escaped, "i");

    filter.$or = [
      { branchName: regex },
      { branchCode: regex },
      { city: regex },
      { state: regex },
    ];
  }

  const [branches, total] = await Promise.all([
    Branch.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),

    Branch.countDocuments(filter),
  ]);

  const result = await serializeBranches(branches);

  return res.status(200).json({
    success: true,
    message: "Branches fetched successfully.",
    data: {
      branches: result,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  });
});

/* =========================================================
   GET BRANCH OVERVIEW WITH TASK SUMMARY
========================================================= */

exports.getBranchOverview = asyncHandler(async (req, res) => {
  const { search = "", status = "ALL" } = req.query;

  const filter = {};
  const normalizedStatus = clean(status).toUpperCase();

  if (normalizedStatus !== "ALL") {
    if (!["ACTIVE", "INACTIVE"].includes(normalizedStatus)) {
      return sendError(
        res,
        400,
        "Status must be ACTIVE, INACTIVE, or ALL."
      );
    }

    filter.status = normalizedStatus;
  }

  if (clean(search)) {
    const escaped = clean(search).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const regex = new RegExp(escaped, "i");

    filter.$or = [
      { branchName: regex },
      { branchCode: regex },
      { city: regex },
      { state: regex },
    ];
  }

  const branches = await Branch.find(filter)
    .sort({ branchName: 1 })
    .lean();

  const serialized = await serializeBranches(branches);

  return res.status(200).json({
    success: true,
    message: "Branch overview fetched successfully.",
    data: {
      summary: {
        totalBranches: serialized.length,

        activeBranches: serialized.filter(
          (branch) => branch.status === "ACTIVE"
        ).length,

        inactiveBranches: serialized.filter(
          (branch) => branch.status === "INACTIVE"
        ).length,

        totalEmployees: serialized.reduce(
          (sum, branch) => sum + branch.employeeCount,
          0
        ),

        totalTasks: serialized.reduce(
          (sum, branch) => sum + branch.taskSummary.total,
          0
        ),

        assignedTasks: serialized.reduce(
          (sum, branch) => sum + branch.taskSummary.assigned,
          0
        ),

        inProgressTasks: serialized.reduce(
          (sum, branch) => sum + branch.taskSummary.inProgress,
          0
        ),

        completedTasks: serialized.reduce(
          (sum, branch) => sum + branch.taskSummary.completed,
          0
        ),

        overdueTasks: serialized.reduce(
          (sum, branch) => sum + branch.taskSummary.overdue,
          0
        ),
      },

      branches: serialized,
    },
  });
});

/* =========================================================
   GET SINGLE BRANCH
========================================================= */

exports.getBranchById = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const branch = await Branch.findById(req.params.id).lean();

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const [result] = await serializeBranches([branch]);

  return res.status(200).json({
    success: true,
    data: { branch: result },
  });
});

/* =========================================================
   CREATE BRANCH
========================================================= */

exports.createBranch = asyncHandler(async (req, res) => {
  const validationError = validateBranchPayload(req.body);

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  let payload;

  try {
    payload = normalizePayload(req.body);
  } catch (error) {
    return sendError(res, 400, error.message);
  }

  const duplicate = await Branch.findOne({
    $or: [
      { branchCode: payload.branchCode },
      {
        branchName: payload.branchName,
        city: payload.city,
      },
    ],
  });

  if (duplicate) {
    return sendError(
      res,
      409,
      "A branch with this code or name in this city already exists."
    );
  }

  try {
    if (payload.branchManagerEmployeeId) {
      const manager = await validateAssignedEmployee(
        payload.branchManagerEmployeeId,
        "BRANCH_MANAGER",
        "Branch manager"
      );

      payload.branchManagerName = employeeName(manager);
    }

    if (payload.hrEmployeeId) {
      const hr = await validateAssignedEmployee(
        payload.hrEmployeeId,
        null,
        "HR"
      );

      payload.hrEmployeeName = employeeName(hr);
    }
  } catch (error) {
    return sendError(res, error.status || 400, error.message);
  }

  const branch = await Branch.create({
    ...payload,
    createdBy: getActorId(req),
    updatedBy: getActorId(req),
  });

  const saved = await Branch.findById(branch._id).lean();
  const [result] = await serializeBranches([saved]);

  return res.status(201).json({
    success: true,
    message: "Branch created successfully.",
    data: { branch: result },
  });
});

/* =========================================================
   UPDATE BRANCH
========================================================= */

exports.updateBranch = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const validationError = validateBranchPayload(req.body, true);

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  let payload;

  try {
    payload = normalizePayload(req.body, branch);
  } catch (error) {
    return sendError(res, 400, error.message);
  }

  const nextCode = payload.branchCode || branch.branchCode;
  const nextName = payload.branchName || branch.branchName;
  const nextCity = payload.city || branch.city;

  const duplicate = await Branch.findOne({
    _id: { $ne: branch._id },
    $or: [
      { branchCode: nextCode },
      { branchName: nextName, city: nextCity },
    ],
  });

  if (duplicate) {
    return sendError(
      res,
      409,
      "Another branch already uses this code or name in this city."
    );
  }

  try {
    if (payload.branchManagerEmployeeId) {
      const manager = await validateAssignedEmployee(
        payload.branchManagerEmployeeId,
        "BRANCH_MANAGER",
        "Branch manager"
      );

      payload.branchManagerName = employeeName(manager);
    } else if (payload.branchManagerEmployeeId === null) {
      payload.branchManagerName = "";
    }

    if (payload.hrEmployeeId) {
      const hr = await validateAssignedEmployee(
        payload.hrEmployeeId,
        null,
        "HR"
      );

      payload.hrEmployeeName = employeeName(hr);
    } else if (payload.hrEmployeeId === null) {
      payload.hrEmployeeName = "";
    }
  } catch (error) {
    return sendError(res, error.status || 400, error.message);
  }

  Object.assign(branch, payload, {
    updatedBy: getActorId(req),
  });

  await branch.save();

  const updated = await Branch.findById(branch._id).lean();
  const [result] = await serializeBranches([updated]);

  return res.status(200).json({
    success: true,
    message: "Branch updated successfully.",
    data: { branch: result },
  });
});

/* =========================================================
   UPDATE BRANCH STATUS
========================================================= */

exports.updateBranchStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const status = clean(req.body.status).toUpperCase();

  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    return sendError(
      res,
      400,
      "Status must be ACTIVE or INACTIVE."
    );
  }

  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        status,
        updatedBy: getActorId(req),
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const [result] = await serializeBranches([branch]);

  return res.status(200).json({
    success: true,
    message: `Branch ${status.toLowerCase()} successfully.`,
    data: { branch: result },
  });
});

/* =========================================================
   GET BRANCH EMPLOYEES AND THEIR TASKS
========================================================= */

exports.getBranchEmployees = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const branch = await Branch.findById(req.params.id).lean();

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const [result] = await serializeBranches([branch]);

  return res.status(200).json({
    success: true,
    message: "Branch employees fetched successfully.",
    data: {
      branch: result,
      employees: result.employees,
      total: result.employeeCount,
      assignedTasks: result.assignedTasks,
      taskSummary: result.taskSummary,
    },
  });
});

/* =========================================================
   UPDATE WORKING HOURS
========================================================= */

exports.updateWorkingHours = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const { workingHours } = req.body;

  if (!workingHours || typeof workingHours !== "object") {
    return sendError(res, 400, "Working hours are required.");
  }

  const validationError = validateBranchPayload(
    { workingHours },
    true
  );

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  const allowedFields = [
    "startTime",
    "endTime",
    "breakStartTime",
    "breakEndTime",
    "workingDays",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (workingHours[field] !== undefined) {
      updates[`workingHours.${field}`] = workingHours[field];
    }
  }

  updates.updatedBy = getActorId(req);

  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const [result] = await serializeBranches([branch]);

  return res.status(200).json({
    success: true,
    message: "Branch working hours updated successfully.",
    data: { branch: result },
  });
});

/* =========================================================
   ASSIGN OR REMOVE BRANCH MANAGER AND HR
========================================================= */

exports.updateBranchAssignments = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const allowedFields = [
    "branchManagerEmployeeId",
    "hrEmployeeId",
  ];

  if (!allowedFields.some((field) => req.body[field] !== undefined)) {
    return sendError(
      res,
      400,
      "Provide branchManagerEmployeeId or hrEmployeeId."
    );
  }

  try {
    if (req.body.branchManagerEmployeeId !== undefined) {
      const id = clean(req.body.branchManagerEmployeeId);

      if (!id) {
        branch.branchManagerEmployeeId = null;
        branch.branchManagerName = "";
      } else {
        const manager = await validateAssignedEmployee(
          id,
          "BRANCH_MANAGER",
          "Branch manager"
        );

        branch.branchManagerEmployeeId = manager._id;
        branch.branchManagerName = employeeName(manager);
      }
    }

    if (req.body.hrEmployeeId !== undefined) {
      const id = clean(req.body.hrEmployeeId);

      if (!id) {
        branch.hrEmployeeId = null;
        branch.hrEmployeeName = "";
      } else {
        const hr = await validateAssignedEmployee(
          id,
          null,
          "HR"
        );

        branch.hrEmployeeId = hr._id;
        branch.hrEmployeeName = employeeName(hr);
      }
    }
  } catch (error) {
    return sendError(res, error.status || 400, error.message);
  }

  branch.updatedBy = getActorId(req);
  await branch.save();

  const updated = await Branch.findById(branch._id).lean();
  const [result] = await serializeBranches([updated]);

  return res.status(200).json({
    success: true,
    message: "Branch assignments updated successfully.",
    data: { branch: result },
  });
});

/* =========================================================
   DEACTIVATE BRANCH
========================================================= */

exports.deleteBranch = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return sendError(res, 400, "Invalid branch ID.");
  }

  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return sendError(res, 404, "Branch not found.");
  }

  const employeeCount = await Employee.countDocuments(
    employeeBranchFilter(branch)
  );

  if (employeeCount > 0) {
    return sendError(
      res,
      409,
      `This branch has ${employeeCount} assigned employee(s). Reassign them before deactivating the branch.`
    );
  }

  branch.status = "INACTIVE";
  branch.updatedBy = getActorId(req);

  await branch.save();

  const [result] = await serializeBranches([
    branch.toObject(),
  ]);

  return res.status(200).json({
    success: true,
    message: "Branch deactivated successfully.",
    data: { branch: result },
  });
});


exports.getBranchDashboard = asyncHandler(async (req, res) => {
  const { search = "", status = "ALL" } = req.query;

  try {
    const filter = {};
    const normalizedStatus = clean(status).toUpperCase();

    if (!["ALL", "ACTIVE", "INACTIVE"].includes(normalizedStatus)) {
      return sendError(
        res,
        400,
        "Status must be ACTIVE, INACTIVE, or ALL."
      );
    }

    if (normalizedStatus !== "ALL") {
      filter.status = normalizedStatus;
    }

    if (clean(search)) {
      const regex = new RegExp(
        clean(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );

      filter.$or = [
        { branchName: regex },
        { branchCode: regex },
        { city: regex },
        { state: regex },
      ];
    }

    // 1. Fetch every branch matching the filters.
    const branches = await Branch.find(filter)
      .sort({ branchName: 1 })
      .lean();

    // 2. Fetch employees independently of their branch string.
    // This prevents employees being excluded by the initial query.
    const employees = await Employee.find({
      status: { $ne: "DELETED" },
    })
      .select(
        "fullName name nameOfEmployee employeeCode email mobileNumber photo profilePhoto photoUrl systemRole designationTitle department operationalTeam branch branchId branchName branchCode reportingManager salary status createdAt updatedAt"
      )
      .sort({ fullName: 1, name: 1 })
      .lean();

    // 3. Fetch all tasks for these branches.
    const branchIds = branches.map((branch) => branch._id);

    const tasks = branchIds.length
      ? await WorkTask.find({ branchId: { $in: branchIds } })
          .populate(
            "assigneeEmployeeId",
            "fullName name employeeCode email systemRole designationTitle department"
          )
          .populate("assignedBy", "fullName name email")
          .sort({ dueDate: 1, createdAt: -1 })
          .lean()
      : [];

    const tasksByBranch = new Map();

    for (const task of tasks) {
      const id = String(task.branchId?._id || task.branchId);

      if (!tasksByBranch.has(id)) {
        tasksByBranch.set(id, []);
      }

      const dueTime = task.dueDate
        ? new Date(task.dueDate).getTime()
        : NaN;

      const taskStatus = String(task.status || "ASSIGNED").toUpperCase();

      tasksByBranch.get(id).push({
        ...task,
        status: taskStatus,
        isOverdue:
          !["COMPLETED", "CANCELLED"].includes(taskStatus) &&
          Number.isFinite(dueTime) &&
          dueTime < Date.now(),
      });
    }

    // 4. Format each employee with salary and task information.
    const employeeById = new Map(
      employees.map((employee) => [String(employee._id), employee])
    );

    function formatEmployee(employee, employeeTasks = []) {
      if (!employee) return null;

      const salary = employee.salary || {};
      const basicPay = Number(salary.basicPay) || 0;
      const hra = Number(salary.hra) || 0;
      const conveyance = Number(salary.conveyance) || 0;
      const tdsDeduction = Number(salary.tdsDeduction) || 0;
      const grossSalary =
        Number(salary.grossSalary) || basicPay + hra + conveyance;

      return {
        ...employee,
        fullName:
          employee.fullName ||
          employee.name ||
          employee.nameOfEmployee ||
          "Unnamed employee",
        salary: {
          ...salary,
          basicPay,
          hra,
          conveyance,
          tdsDeduction,
          grossSalary,
          netSalary:
            Number(salary.netSalary) || grossSalary - tdsDeduction,
        },
        grossSalary,
        netSalary: grossSalary - tdsDeduction,
        assignedTasks: employeeTasks,
        taskSummary: {
          total: employeeTasks.length,
          assigned: employeeTasks.filter(
            (task) => task.status === "ASSIGNED"
          ).length,
          inProgress: employeeTasks.filter(
            (task) => task.status === "IN_PROGRESS"
          ).length,
          submitted: employeeTasks.filter(
            (task) => task.status === "SUBMITTED"
          ).length,
          completed: employeeTasks.filter(
            (task) => task.status === "COMPLETED"
          ).length,
          cancelled: employeeTasks.filter(
            (task) => task.status === "CANCELLED"
          ).length,
          overdue: employeeTasks.filter(
            (task) => task.isOverdue
          ).length,
        },
      };
    }

    // 5. Build complete branch data, including separately assigned HR
    // and branch managers even if their Employee.branch value differs.
    const resultBranches = branches.map((branch) => {
      const id = String(branch._id);
      const branchKeys = [
        clean(branch.branchName).toLowerCase(),
        clean(branch.branchCode).toLowerCase(),
      ].filter(Boolean);

      const branchTasks = tasksByBranch.get(id) || [];

      const matchesBranch = (employee) => {
        const employeeBranchValues = [
          employee.branch,
          employee.branchName,
          employee.branchCode,
        ]
          .map((value) => clean(value).toLowerCase())
          .filter(Boolean);

        const storedBranchId =
          employee.branchId?._id || employee.branchId;

        return (
          (storedBranchId && String(storedBranchId) === id) ||
          employeeBranchValues.some((value) =>
            branchKeys.includes(value)
          )
        );
      };

      const managerKey = branch.branchManagerEmployeeId?._id ||
        branch.branchManagerEmployeeId;

      const hrKey = branch.hrEmployeeId?._id || branch.hrEmployeeId;

      const manager =
        employeeById.get(String(managerKey || "")) || null;

      const hr =
        employeeById.get(String(hrKey || "")) || null;

      const employeeMap = new Map();

      for (const employee of employees.filter(matchesBranch)) {
        employeeMap.set(String(employee._id), employee);
      }

      for (const person of [manager, hr]) {
        if (person && person.status !== "DELETED") {
          employeeMap.set(String(person._id), person);
        }
      }

      const branchEmployees = [...employeeMap.values()]
        .filter((employee) => employee.status !== "DELETED")
        .map((employee) => {
          const employeeTasks = branchTasks.filter((task) => {
            const assigneeId =
              task.assigneeEmployeeId?._id ||
              task.assigneeEmployeeId;

            return String(assigneeId || "") === String(employee._id);
          });

          return formatEmployee(employee, employeeTasks);
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      const departments = [
        ...new Set(
          branchEmployees
            .map((employee) => employee.department)
            .filter(Boolean)
        ),
      ].sort();

      const countStatus = (value) =>
        branchTasks.filter(
          (task) => task.status === value
        ).length;

      const taskSummary = {
        total: branchTasks.length,
        assigned: countStatus("ASSIGNED"),
        inProgress: countStatus("IN_PROGRESS"),
        submitted: countStatus("SUBMITTED"),
        completed: countStatus("COMPLETED"),
        cancelled: countStatus("CANCELLED"),
        overdue: branchTasks.filter((task) => task.isOverdue).length,
      };

      return {
        ...branch,
        branchManager: formatEmployee(manager),
        branchManagerEmployeeId: manager?._id || managerKey || null,
        branchManagerName:
          manager?.fullName ||
          manager?.name ||
          branch.branchManagerName ||
          "",
        hrEmployee: formatEmployee(hr),
        hrEmployeeId: hr?._id || hrKey || null,
        hrEmployeeName:
          hr?.fullName || hr?.name || branch.hrEmployeeName || "",
        employeeCount: branchEmployees.length,
        employees: branchEmployees,
        departments,
        assignedTasks: branchTasks,
        taskSummary,
      };
    });

    // 6. Dashboard totals.
    const uniqueEmployees = new Set();
    const uniqueManagers = new Set();
    const uniqueHr = new Set();

    for (const branch of resultBranches) {
      for (const employee of branch.employees) {
        uniqueEmployees.add(String(employee._id));
      }

      if (branch.branchManager?._id) {
        uniqueManagers.add(String(branch.branchManager._id));
      }

      if (branch.hrEmployee?._id) {
        uniqueHr.add(String(branch.hrEmployee._id));
      }
    }

    const summary = {
      totalBranches: resultBranches.length,
      activeBranches: resultBranches.filter(
        (branch) => branch.status === "ACTIVE"
      ).length,
      inactiveBranches: resultBranches.filter(
        (branch) => branch.status === "INACTIVE"
      ).length,
      totalEmployees: uniqueEmployees.size,
      totalManagers: uniqueManagers.size,
      totalHrEmployees: uniqueHr.size,
      totalTasks: resultBranches.reduce(
        (sum, branch) => sum + branch.taskSummary.total,
        0
      ),
    };

    return res.status(200).json({
      success: true,
      message: "Branch dashboard loaded successfully.",
      data: {
        summary,
        branches: resultBranches,
      },
    });
  } catch (error) {
    console.error("GET BRANCH DASHBOARD ERROR:", error);

    return sendError(
      res,
      500,
      "Unable to load branch dashboard."
    );
  }
});
