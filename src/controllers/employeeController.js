
"use strict";

const mongoose = require("mongoose");
const admin = require("../config/firebase");
const Employee = require("../models/Employee");

const ALLOWED_ROLES = [
  "EMPLOYEE",
  "BRANCH_MANAGER",
  "HR_ADMIN",
];

const ALLOWED_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "ON_HOLD",
  "INACTIVE",
];

const clean = (value) => String(value ?? "").trim();

const normalizeCode = (value) => clean(value).toUpperCase();

const normalizeRole = (value) => {
  const role = clean(value).toUpperCase();

  const roles = {
    "EMPLOYEE / FIELD STAFF": "EMPLOYEE",
    EMPLOYEE: "EMPLOYEE",
    "BRANCH MANAGER": "BRANCH_MANAGER",
    "HR & ADMIN": "HR_ADMIN",
    "HR ADMIN": "HR_ADMIN",
  };

  return roles[role] || role;
};

const normalizeStatus = (value) => {
  const status = clean(value).toUpperCase();

  const statuses = {
    "ACTIVE (IMMEDIATE ACCESS)": "ACTIVE",
    "PROBATION (90-DAY REVIEW)": "PROBATION",
    "ON_HOLD (PENDING VERIFICATION)": "ON_HOLD",
  };

  return statuses[status] || status;
};

const normalizePayload = (body = {}, existing = {}) => {
  const oldSalary = existing.salary || {};
  const incomingSalary = body.salary || {};

  return {
    employeeCode: normalizeCode(
      body.employeeCode ??
        body.userId ??
        body.userID ??
        existing.employeeCode
    ),

    fullName: clean(
      body.fullName ?? body.name ?? existing.fullName
    ),

    email: clean(
      body.email ?? existing.email
    ).toLowerCase(),

    mobileNumber: clean(
      body.mobileNumber ?? existing.mobileNumber
    ),

    systemRole: normalizeRole(
      body.systemRole ?? existing.systemRole ?? "EMPLOYEE"
    ),

    branch: clean(
      body.branch ??
        body.assignedBranch ??
        existing.branch
    ),

    department: clean(
      body.department ?? existing.department
    ),

    operationalTeam: clean(
      body.operationalTeam ?? existing.operationalTeam
    ),

    designationTitle: clean(
      body.designationTitle ??
        body.designation ??
        existing.designationTitle
    ),

    reportingManager: clean(
      body.reportingManager ?? existing.reportingManager
    ),

    status: normalizeStatus(
      body.status ?? existing.status ?? "ACTIVE"
    ),

    salary: {
      basicPay: Number(
        incomingSalary.basicPay ??
          body.basicPay ??
          oldSalary.basicPay ??
          0
      ),

      hra: Number(
        incomingSalary.hra ??
          body.hra ??
          oldSalary.hra ??
          0
      ),

      conveyance: Number(
        incomingSalary.conveyance ??
          body.conveyance ??
          oldSalary.conveyance ??
          0
      ),

      tdsDeduction: Number(
        incomingSalary.tdsDeduction ??
          body.tdsDeduction ??
          oldSalary.tdsDeduction ??
          0
      ),
    },
  };
};

const validateEmployee = (data) => {
  const requiredFields = [
    "fullName",
    "email",
    "mobileNumber",
    "branch",
    "department",
    "operationalTeam",
    "designationTitle",
  ];

  const missing = requiredFields.filter(
    (field) => !data[field]
  );

  if (missing.length) {
    return `Required fields missing: ${missing.join(", ")}`;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return "Enter a valid email address";
  }

  if (!ALLOWED_ROLES.includes(data.systemRole)) {
    return "Invalid system role";
  }

  if (!ALLOWED_STATUSES.includes(data.status)) {
    return "Invalid employee status";
  }

  if (
    data.employeeCode &&
    !/^[A-Z0-9_-]{2,30}$/.test(data.employeeCode)
  ) {
    return "Employee code must contain 2-30 letters, numbers, hyphens or underscores";
  }

  for (const value of Object.values(data.salary)) {
    if (!Number.isFinite(value) || value < 0) {
      return "Salary amounts must be valid non-negative numbers";
    }
  }

  return null;
};

const publicEmployee = (employee) => {
  const result = employee.toObject
    ? employee.toObject()
    : { ...employee };

  delete result.firebaseUid;
  delete result.__v;

  return result;
};

const isDuplicateError = (error) =>
  error.code === 11000 ||
  error.code === "auth/email-already-exists" ||
  error.code === "auth/uid-already-exists";

const sendError = (res, error, label, message) => {
  console.error(`${label}:`, error);

  if (isDuplicateError(error)) {
    return res.status(409).json({
      success: false,
      message: "Employee code or email already exists",
    });
  }

  if (
    error.code === "auth/invalid-email" ||
    error.code === "auth/invalid-password"
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message,
  });
};

// Generate the next employee code.
const generateEmployeeCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const employees = await Employee.find({
      employeeCode: /^ZER-\d+$/,
    })
      .select("employeeCode")
      .lean();

    const highestNumber = employees.reduce((highest, employee) => {
      const number = Number(
        employee.employeeCode.replace("ZER-", "")
      );

      return Number.isFinite(number)
        ? Math.max(highest, number)
        : highest;
    }, 124);

    const candidate = `ZER-${String(
      highestNumber + 1 + attempt
    ).padStart(3, "0")}`;

    if (!(await Employee.exists({ employeeCode: candidate }))) {
      return candidate;
    }
  }

  throw new Error("Unable to generate employee code. Please retry.");
};

// POST /api/employee/auth
// Create a Firebase user and its MongoDB employee record.
exports.createEmployee = async (req, res) => {
  let firebaseUid = null;
  let employeeSaved = false;

  try {
    const data = normalizePayload(req.body);

    const password = String(
      req.body.initialPassword ??
        req.body.password ??
        ""
    );

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Initial password must contain at least 6 characters",
      });
    }

    if (!data.employeeCode) {
      data.employeeCode = await generateEmployeeCode();
    }

    const validationError = validateEmployee(data);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    if (!req.superAdmin?._id) {
      return res.status(403).json({
        success: false,
        message: "Authenticated Super Admin record not found",
      });
    }

    const duplicate = await Employee.findOne({
      $or: [
        { employeeCode: data.employeeCode },
        { email: data.email },
      ],
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Employee code or email already exists",
      });
    }

    // Create the Firebase Authentication account.
    const firebaseUser = await admin.auth().createUser({
      email: data.email,
      password,
      displayName: data.fullName,
      disabled: data.status === "INACTIVE",
      emailVerified: false,
    });

    firebaseUid = firebaseUser.uid;

    // Set employee permissions and identity claims.
    await admin.auth().setCustomUserClaims(firebaseUid, {
      role: data.systemRole,
      employeeCode: data.employeeCode,
    });

    // Save employee information in MongoDB.
    const employee = await Employee.create({
      ...data,
      firebaseUid,
      createdBy: req.superAdmin._id,
    });

    employeeSaved = true;

    return res.status(201).json({
      success: true,
      message: "Employee account created successfully",
      employee: publicEmployee(employee),
      login: {
        employeeCode: employee.employeeCode,
        email: employee.email,
        authProvider: "Firebase",
      },
    });
  } catch (error) {
    // Clean up the Firebase account if MongoDB creation fails.
    if (firebaseUid && !employeeSaved) {
      try {
        await admin.auth().deleteUser(firebaseUid);
      } catch (cleanupError) {
        console.error(
          "FIREBASE CLEANUP ERROR:",
          cleanupError.message
        );
      }
    }

    return sendError(
      res,
      error,
      "CREATE EMPLOYEE ERROR",
      "Unable to create employee account"
    );
  }
};

// GET /api/employee/auth
exports.listEmployees = async (req, res) => {
  try {
    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const filter = {
      status: { $ne: "DELETED" },
    };

    const search = clean(req.query.search);
    const status = normalizeStatus(req.query.status);

    if (ALLOWED_STATUSES.includes(status)) {
      filter.status = status;
    }

    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        { employeeCode: { $regex: escapedSearch, $options: "i" } },
        { fullName: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
        { mobileNumber: { $regex: escapedSearch, $options: "i" } },
        { branch: { $regex: escapedSearch, $options: "i" } },
        { department: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .select("-firebaseUid -__v")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Employee.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "LIST EMPLOYEES ERROR",
      "Unable to load employees"
    );
  }
};

// GET /api/employee/auth/:id
exports.getEmployee = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const employee = await Employee.findOne({
      _id: req.params.id,
      status: { $ne: "DELETED" },
    }).select("-firebaseUid -__v");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    return res.json({
      success: true,
      employee,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "GET EMPLOYEE ERROR",
      "Unable to load employee"
    );
  }
};

// PATCH /api/employee/auth/:id
exports.updateEmployee = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const employee = await Employee.findOne({
      _id: req.params.id,
      status: { $ne: "DELETED" },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const data = normalizePayload(req.body, employee);
    const validationError = validateEmployee(data);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const duplicate = await Employee.findOne({
      _id: { $ne: employee._id },
      $or: [
        { employeeCode: data.employeeCode },
        { email: data.email },
      ],
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Employee code or email is already in use",
      });
    }

    const newPassword =
      req.body.initialPassword ?? req.body.password;

    if (
      newPassword !== undefined &&
      newPassword !== "" &&
      String(newPassword).length < 6
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters",
      });
    }

    // Synchronize the existing Firebase account.
    if (employee.firebaseUid) {
      const firebaseUpdates = {
        displayName: data.fullName,
        email: data.email,
        disabled: data.status === "INACTIVE" || data.status === "DELETED",
      };

      if (newPassword !== undefined && newPassword !== "") {
        firebaseUpdates.password = String(newPassword);
      }

      await admin.auth().updateUser(
        employee.firebaseUid,
        firebaseUpdates
      );

      await admin.auth().setCustomUserClaims(
        employee.firebaseUid,
        {
          role: data.systemRole,
          employeeCode: data.employeeCode,
        }
      );
    }

    Object.assign(employee, data);
    await employee.save();

    return res.json({
      success: true,
      message: "Employee updated successfully",
      employee: publicEmployee(employee),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "UPDATE EMPLOYEE ERROR",
      "Unable to update employee"
    );
  }
};

// DELETE /api/employee/auth/:id
// Soft-delete the MongoDB record and disable Firebase access.
exports.deleteEmployee = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const employee = await Employee.findOne({
      _id: req.params.id,
      status: { $ne: "DELETED" },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (employee.firebaseUid) {
      try {
        await admin.auth().updateUser(employee.firebaseUid, {
          disabled: true,
        });

        await admin.auth().revokeRefreshTokens(employee.firebaseUid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }
      }
    }

    employee.status = "DELETED";
    await employee.save();

    return res.json({
      success: true,
      message: "Employee deleted and login disabled",
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "DELETE EMPLOYEE ERROR",
      "Unable to delete employee"
    );
  }
};

// GET /api/employee/auth/me/profile
exports.getMyProfile = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const employee = await Employee.findOne({
      firebaseUid: uid,
      status: { $nin: ["DELETED", "INACTIVE"] },
    }).select("-firebaseUid -__v");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    return res.json({
      success: true,
      employee,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "GET MY PROFILE ERROR",
      "Unable to load profile"
    );
  }
};

// PATCH /api/employee/auth/me/profile
exports.updateMyProfile = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const employee = await Employee.findOne({
      firebaseUid: uid,
      status: { $nin: ["DELETED", "INACTIVE"] },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    if (req.body.fullName !== undefined) {
      const fullName = clean(req.body.fullName);

      if (!fullName) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty",
        });
      }

      employee.fullName = fullName;

      if (employee.firebaseUid) {
        await admin.auth().updateUser(employee.firebaseUid, {
          displayName: fullName,
        });
      }
    }

    if (req.body.mobileNumber !== undefined) {
      const mobileNumber = clean(req.body.mobileNumber);

      if (!mobileNumber) {
        return res.status(400).json({
          success: false,
          message: "Mobile number cannot be empty",
        });
      }

      employee.mobileNumber = mobileNumber;
    }

    await employee.save();

    return res.json({
      success: true,
      message: "Profile updated successfully",
      employee: publicEmployee(employee),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "UPDATE MY PROFILE ERROR",
      "Unable to update profile"
    );
  }
};
// POST /api/employee/auth/login
// POST /api/employee/auth/login
exports.loginEmployee = async (req, res) => {
  try {
    const idToken = clean(req.body?.idToken);

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Firebase ID token is required.",
      });
    }

    let decoded;

    try {
      decoded = await admin.auth().verifyIdToken(idToken, true);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired login session. Please sign in again.",
      });
    }

    const employee = await Employee.findOne({
      firebaseUid: decoded.uid,
      status: { $nin: ["DELETED", "INACTIVE"] },
    }).select("-firebaseUid -__v");

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: "Employee account not found or access is disabled.",
      });
    }

    const allowedRoles = [
      "EMPLOYEE",
      "BRANCH_MANAGER",
      "HR_ADMIN",
    ];

    if (!allowedRoles.includes(employee.systemRole)) {
      return res.status(403).json({
        success: false,
        message: "Your role is not authorized to access the employee portal.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      employee,
      user: {
        uid: decoded.uid,
        email: decoded.email || employee.email,
        role: employee.systemRole,
        employeeId: employee._id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      },
      redirectTo: {
        EMPLOYEE: "/employee/dashboard",
        BRANCH_MANAGER: "/branch-manager/dashboard",
        HR_ADMIN: "/hr/dashboard",
      }[employee.systemRole],
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "EMPLOYEE LOGIN ERROR",
      "Unable to verify employee login."
    );
  }
};

// GET /api/employee/auth/me/profile
// Requires Firebase authentication middleware.
// GET /api/employee/auth/me/profile
exports.getMyProfile = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const employee = await Employee.findOne({
      firebaseUid: uid,
      status: { $nin: ["DELETED", "INACTIVE"] },
    }).select("-firebaseUid -__v");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile loaded successfully.",
      employee,
      user: {
        uid,
        role: employee.systemRole,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        email: employee.email,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "GET MY PROFILE ERROR",
      "Unable to load employee profile."
    );
  }
};

// POST /api/employee/auth/logout
// Requires Firebase authentication middleware.
// POST /api/employee/auth/logout
exports.logoutEmployee = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    await admin.auth().revokeRefreshTokens(uid);

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "EMPLOYEE LOGOUT ERROR",
      "Unable to log out employee."
    );
  }
};

// Keep compatibility aliases if existing routes use these names.
exports.getMyEmployeeProfile = exports.getMyProfile;
exports.updateMyEmployeeProfile = exports.updateMyProfile;
// Compatibility aliases for existing route names.
exports.getMyEmployeeProfile = exports.getMyProfile;
exports.updateMyEmployeeProfile = exports.updateMyProfile;
