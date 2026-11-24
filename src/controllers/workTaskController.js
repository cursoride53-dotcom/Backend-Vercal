
"use strict";

const mongoose = require("mongoose");
const WorkTask = require("../models/WorkTask");
const Branch = require("../models/Branch");
const Employee = require("../models/Employee");

const clean = (value) => String(value ?? "").trim();

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const actorId = (req) =>
  req.user?.superAdminId ||
  req.user?._id ||
  req.user?.uid ||
  null;

const fail = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const VALID_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "COMPLETED",
  "CANCELLED",
];

function isActive(employee) {
  return (
    String(employee?.status || "ACTIVE").toUpperCase() === "ACTIVE"
  );
}

function employeeName(employee) {
  return (
    employee?.fullName ||
    employee?.name ||
    employee?.nameOfEmployee ||
    "Employee"
  );
}

function populateTask(query) {
  return query
    .populate("branchId", "branchName branchCode city state")
    .populate(
      "assigneeEmployeeId",
      "employeeCode fullName email mobileNumber systemRole designationTitle department branch status"
    )
    .populate("assignedBy", "fullName name email");
}

// POST /api/work-tasks
// Create and assign a task to an employee in the selected branch.
exports.createTask = asyncHandler(async (req, res) => {
  const {
    title,
    assigneeEmployeeId,
    branchId,
    priority = "MEDIUM",
    dueDate,
    instructions,
    expectedDeliverable = "",
  } = req.body || {};

  if (!clean(title)) {
    return fail(res, 400, "Task title is required.");
  }

  if (!mongoose.isValidObjectId(assigneeEmployeeId)) {
    return fail(res, 400, "Select a valid assignee employee.");
  }

  if (!mongoose.isValidObjectId(branchId)) {
    return fail(res, 400, "Select a valid branch.");
  }

  if (!clean(dueDate) || Number.isNaN(new Date(dueDate).getTime())) {
    return fail(res, 400, "A valid due deadline is required.");
  }

  if (!clean(instructions)) {
    return fail(res, 400, "Detailed instructions are required.");
  }

  const normalizedPriority = clean(priority).toUpperCase();

  if (!VALID_PRIORITIES.includes(normalizedPriority)) {
    return fail(
      res,
      400,
      "Priority must be LOW, MEDIUM, HIGH, or URGENT."
    );
  }

  const [branch, employee] = await Promise.all([
    Branch.findById(branchId).lean(),
    Employee.findById(assigneeEmployeeId).lean(),
  ]);

  if (!branch) {
    return fail(res, 404, "Selected branch was not found.");
  }

  if (!employee) {
    return fail(res, 404, "Selected employee was not found.");
  }

  if (!isActive(employee)) {
    return fail(
      res,
      400,
      "Only active employees can be assigned a task."
    );
  }

  // This HRMS Employee schema stores branch as a string.
  // It must match the selected branch name or branch code.
  const employeeBranch = clean(employee.branch).toLowerCase();

  const validBranchValues = [
    branch.branchName,
    branch.branchCode,
  ]
    .filter(Boolean)
    .map((value) => clean(value).toLowerCase());

  if (!validBranchValues.includes(employeeBranch)) {
    return fail(
      res,
      400,
      "The selected employee is not assigned to this branch. Update the employee's branch first."
    );
  }

  const task = await WorkTask.create({
    title: clean(title),
    assigneeEmployeeId: employee._id,
    branchId: branch._id,
    branchName: branch.branchName,
    priority: normalizedPriority,
    dueDate: new Date(dueDate),
    instructions: clean(instructions),
    expectedDeliverable: clean(expectedDeliverable),
    assignedBy: actorId(req),
  });

  const populatedTask = await populateTask(
    WorkTask.findById(task._id)
  );

  return res.status(201).json({
    success: true,
    message: `Task assigned to ${employeeName(employee)} successfully.`,
    data: {
      task: populatedTask,
    },
  });
});

// GET /api/work-tasks?page=1&limit=50
// Optional filters: branchId, employeeId, status, priority.
exports.getTasks = asyncHandler(async (req, res) => {
  const page = Math.max(
    1,
    Number.parseInt(req.query.page, 10) || 1
  );

  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 50)
  );

  const filter = {};

  if (req.query.branchId) {
    if (!mongoose.isValidObjectId(req.query.branchId)) {
      return fail(res, 400, "Invalid branch ID.");
    }

    filter.branchId = req.query.branchId;
  }

  if (req.query.employeeId) {
    if (!mongoose.isValidObjectId(req.query.employeeId)) {
      return fail(res, 400, "Invalid employee ID.");
    }

    filter.assigneeEmployeeId = req.query.employeeId;
  }

  if (req.query.status) {
    const status = clean(req.query.status).toUpperCase();

    if (!VALID_STATUSES.includes(status)) {
      return fail(res, 400, "Invalid task status.");
    }

    filter.status = status;
  }

  if (req.query.priority) {
    const priority = clean(req.query.priority).toUpperCase();

    if (!VALID_PRIORITIES.includes(priority)) {
      return fail(res, 400, "Invalid task priority.");
    }

    filter.priority = priority;
  }

  const [tasks, total] = await Promise.all([
    populateTask(
      WorkTask.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ).lean(),

    WorkTask.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// GET /api/work-tasks/:id
exports.getTaskById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, 400, "Invalid task ID.");
  }

  const task = await populateTask(
    WorkTask.findById(req.params.id)
  );

  if (!task) {
    return fail(res, 404, "Task not found.");
  }

  return res.json({
    success: true,
    data: { task },
  });
});

// PATCH /api/work-tasks/:id
exports.updateTask = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, 400, "Invalid task ID.");
  }

  const task = await WorkTask.findById(req.params.id);

  if (!task) {
    return fail(res, 404, "Task not found.");
  }

  if (["COMPLETED", "CANCELLED"].includes(task.status)) {
    return fail(
      res,
      409,
      "Completed or cancelled tasks cannot be edited."
    );
  }

  const body = req.body || {};

  if (body.title !== undefined) {
    if (!clean(body.title)) {
      return fail(res, 400, "Task title cannot be empty.");
    }

    task.title = clean(body.title);
  }

  if (body.instructions !== undefined) {
    if (!clean(body.instructions)) {
      return fail(
        res,
        400,
        "Detailed instructions cannot be empty."
      );
    }

    task.instructions = clean(body.instructions);
  }

  if (body.expectedDeliverable !== undefined) {
    task.expectedDeliverable = clean(body.expectedDeliverable);
  }

  if (body.priority !== undefined) {
    const priority = clean(body.priority).toUpperCase();

    if (!VALID_PRIORITIES.includes(priority)) {
      return fail(res, 400, "Invalid task priority.");
    }

    task.priority = priority;
  }

  if (body.dueDate !== undefined) {
    const date = new Date(body.dueDate);

    if (!clean(body.dueDate) || Number.isNaN(date.getTime())) {
      return fail(res, 400, "Invalid due deadline.");
    }

    task.dueDate = date;
  }

  if (body.assigneeEmployeeId !== undefined) {
    if (!mongoose.isValidObjectId(body.assigneeEmployeeId)) {
      return fail(res, 400, "Invalid assignee employee ID.");
    }

    const employee = await Employee.findById(
      body.assigneeEmployeeId
    ).lean();

    if (!employee) {
      return fail(res, 404, "Assignee employee was not found.");
    }

    if (!isActive(employee)) {
      return fail(
        res,
        400,
        "Only active employees can be assigned a task."
      );
    }

    const branch = await Branch.findById(task.branchId).lean();

    const branchValues = [
      branch?.branchName,
      branch?.branchCode,
    ]
      .filter(Boolean)
      .map((value) => clean(value).toLowerCase());

    if (!branchValues.includes(clean(employee.branch).toLowerCase())) {
      return fail(
        res,
        400,
        "The employee must belong to the task's branch."
      );
    }

    task.assigneeEmployeeId = employee._id;
  }

  await task.save();

  const updatedTask = await populateTask(
    WorkTask.findById(task._id)
  );

  return res.json({
    success: true,
    message: "Task updated successfully.",
    data: { task: updatedTask },
  });
});

// PATCH /api/work-tasks/:id/status
exports.updateTaskStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, 400, "Invalid task ID.");
  }

  const status = clean(req.body?.status).toUpperCase();

  if (!VALID_STATUSES.includes(status)) {
    return fail(res, 400, "Invalid task status.");
  }

  const task = await WorkTask.findById(req.params.id);

  if (!task) {
    return fail(res, 404, "Task not found.");
  }

  task.status = status;

  if (status === "IN_PROGRESS" && !task.startedAt) {
    task.startedAt = new Date();
  }

  if (status === "SUBMITTED") {
    task.submittedAt = new Date();
  }

  if (status === "COMPLETED") {
    task.completedAt = new Date();
  }

  if (req.body?.completionNotes !== undefined) {
    task.completionNotes = clean(req.body.completionNotes);
  }

  await task.save();

  const updatedTask = await populateTask(
    WorkTask.findById(task._id)
  );

  return res.json({
    success: true,
    message: "Task status updated successfully.",
    data: { task: updatedTask },
  });
});

// DELETE /api/work-tasks/:id
// Soft-cancel the task so task history is retained.
exports.cancelTask = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return fail(res, 400, "Invalid task ID.");
  }

  const task = await WorkTask.findById(req.params.id);

  if (!task) {
    return fail(res, 404, "Task not found.");
  }

  if (task.status === "COMPLETED") {
    return fail(
      res,
      409,
      "Completed tasks cannot be cancelled."
    );
  }

  task.status = "CANCELLED";
  await task.save();

  const updatedTask = await populateTask(
    WorkTask.findById(task._id)
  );

  return res.json({
    success: true,
    message: "Task cancelled successfully.",
    data: { task: updatedTask },
  });
});
