"use strict";

const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const LeaveApplication = require("../models/LeaveApplication");

const LEAVE_TYPES = [
  "CASUAL",
  "SICK",
  "EARNED",
  "UNPAID",
  "MATERNITY",
  "PATERNITY",
  "COMPENSATORY",
  "OTHER",
];

const LEAVE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const ACTIVE_STATUSES = ["PENDING", "APPROVED"];

function validDateString(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function calendarDays(start, end) {
  return (
    Math.floor(
      (Date.parse(`${end}T00:00:00Z`) -
        Date.parse(`${start}T00:00:00Z`)) /
        86400000
    ) + 1
  );
}

function paginationValue(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, maximum);
}

function employeeSnapshot(employee) {
  const name =
    employee.name ||
    employee.fullName ||
    employee.employeeName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.email ||
    employee.employeeCode ||
    "Employee";

  return {
    employee: employee._id,
    employeeName: String(name).trim(),
    employeeCode: String(employee.employeeCode || employee.code || ""),
    employeeEmail: String(employee.email || "").toLowerCase(),
    branch: String(
      employee.branchName ||
        employee.branch ||
        employee.branchCode ||
        ""
    ),
  };
}

function validateLeaveInput(body) {
  const leaveType = String(body.leaveType || "").trim().toUpperCase();
  const startDate = body.startDate;
  const endDate = body.endDate;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const contact =
    typeof body.contactDuringLeave === "string"
      ? body.contactDuringLeave.trim()
      : "";

  if (!LEAVE_TYPES.includes(leaveType)) {
    return { error: "Select a valid leave type." };
  }

  if (!validDateString(startDate) || !validDateString(endDate)) {
    return {
      error: "Valid startDate and endDate are required in YYYY-MM-DD format.",
    };
  }

  if (startDate > endDate) {
    return { error: "End date cannot be earlier than start date." };
  }

  const totalDays = calendarDays(startDate, endDate);

  if (totalDays < 1 || totalDays > 366) {
    return { error: "Leave duration must be between 1 and 366 calendar days." };
  }

  if (!reason) {
    return { error: "Please provide a reason for the leave application." };
  }

  if (reason.length > 2000) {
    return { error: "Leave reason cannot exceed 2000 characters." };
  }

  if (contact.length > 30) {
    return { error: "Contact number cannot exceed 30 characters." };
  }

  return {
    value: {
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      contactDuringLeave: contact,
    },
  };
}

async function findOverlap(employeeId, startDate, endDate, excludeId) {
  const filter = {
    employee: employeeId,
    status: { $in: ACTIVE_STATUSES },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeId) filter._id = { $ne: excludeId };

  return LeaveApplication.findOne(filter).lean();
}

function employeeId(req) {
  return req.employee?._id;
}

/* =====================================================
   EMPLOYEE: APPLY FOR LEAVE
   POST /api/leaves
===================================================== */

async function applyLeave(req, res) {
  try {
    if (!employeeId(req)) {
      return res.status(401).json({
        success: false,
        message: "Authenticated employee was not found.",
      });
    }

    const validated = validateLeaveInput(req.body || {});

    if (validated.error) {
      return res.status(400).json({
        success: false,
        message: validated.error,
      });
    }

    const employee = req.employee;
    const leave = validated.value;

    const conflict = await findOverlap(
      employee._id,
      leave.startDate,
      leave.endDate
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending or approved application for overlapping dates.",
        conflictingApplication: {
          id: conflict._id,
          startDate: conflict.startDate,
          endDate: conflict.endDate,
          status: conflict.status,
        },
      });
    }

    const application = await LeaveApplication.create({
      ...employeeSnapshot(employee),
      ...leave,
      appliedByRole: "EMPLOYEE",
      status: "PENDING",
    });

    return res.status(201).json({
      success: true,
      message: "Leave application submitted successfully.",
      data: application,
    });
  } catch (error) {
    console.error("APPLY LEAVE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit leave application.",
    });
  }
}

/* =====================================================
   EMPLOYEE: MY LEAVE APPLICATIONS
   GET /api/leaves/my
===================================================== */

async function myLeaves(req, res) {
  try {
    if (!employeeId(req)) {
      return res.status(401).json({
        success: false,
        message: "Authenticated employee was not found.",
      });
    }

    const page = paginationValue(req.query.page, 1, 100000);
    const limit = paginationValue(req.query.limit, 10, 100);
    const filter = { employee: employeeId(req) };

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();

      if (!LEAVE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leave status.",
        });
      }

      filter.status = status;
    }

    const [data, total] = await Promise.all([
      LeaveApplication.find(filter)
        .sort({ appliedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LeaveApplication.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("MY LEAVES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your leave applications.",
    });
  }
}

/* =====================================================
   EMPLOYEE: VIEW OWN APPLICATION
   GET /api/leaves/my/:id
===================================================== */

async function myLeaveById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave application ID.",
      });
    }

    const application = await LeaveApplication.findOne({
      _id: req.params.id,
      employee: employeeId(req),
    }).lean();

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found.",
      });
    }

    return res.status(200).json({ success: true, data: application });
  } catch (error) {
    console.error("MY LEAVE DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave application.",
    });
  }
}

/* =====================================================
   EMPLOYEE: CANCEL PENDING LEAVE
   PATCH /api/leaves/my/:id/cancel
===================================================== */

async function cancelLeave(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave application ID.",
      });
    }

    const application = await LeaveApplication.findOne({
      _id: req.params.id,
      employee: employeeId(req),
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found.",
      });
    }

    if (application.status !== "PENDING") {
      return res.status(409).json({
        success: false,
        message: "Only pending leave applications can be cancelled.",
      });
    }

    application.status = "CANCELLED";
    application.cancelledAt = new Date();

    await application.save();

    return res.status(200).json({
      success: true,
      message: "Leave application cancelled successfully.",
      data: application,
    });
  } catch (error) {
    console.error("CANCEL LEAVE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel leave application.",
    });
  }
}

/* =====================================================
   SUPER ADMIN: ACTIVE EMPLOYEE DROPDOWN
   GET /api/leaves/admin/employees?search=
===================================================== */

async function adminEmployees(req, res) {
  try {
    const search = String(req.query.search || "").trim().slice(0, 100);

    const filter = {
      status: "ACTIVE",
    };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      filter.$or = [
        { name: regex },
        { fullName: regex },
        { employeeName: regex },
        { firstName: regex },
        { lastName: regex },
        { employeeCode: regex },
        { code: regex },
        { email: regex },
      ];
    }

    // Do not return authentication secrets or sensitive employee documents.
    const employees = await Employee.find(filter)
      .select("_id name fullName employeeName firstName lastName employeeCode code email branch branchName branchCode status")
      .sort({ name: 1, employeeName: 1, employeeCode: 1 })
      .limit(200)
      .lean();

    const data = employees.map((employee) => ({
      _id: employee._id,
      ...employeeSnapshot(employee),
      status: employee.status,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("ADMIN LEAVE EMPLOYEE LIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch active employees.",
    });
  }
}

/* =====================================================
   SUPER ADMIN: CREATE LEAVE FOR SELECTED EMPLOYEE
   POST /api/leaves/admin/create-for-employee
===================================================== */

async function adminCreateLeave(req, res) {
  try {
    const superAdmin = req.superAdmin;

    if (!superAdmin?._id) {
      return res.status(403).json({
        success: false,
        message: "Authenticated Super Admin information is missing.",
      });
    }

    const selectedEmployeeId = req.body?.employeeId;

    if (!mongoose.isValidObjectId(selectedEmployeeId)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid employee.",
      });
    }

    const validated = validateLeaveInput(req.body || {});

    if (validated.error) {
      return res.status(400).json({
        success: false,
        message: validated.error,
      });
    }

    const employee = await Employee.findOne({
      _id: selectedEmployeeId,
      status: "ACTIVE",
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Active employee not found.",
      });
    }

    const leave = validated.value;

    const conflict = await findOverlap(
      employee._id,
      leave.startDate,
      leave.endDate
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: "This employee already has a pending or approved application for overlapping dates.",
        conflictingApplication: {
          id: conflict._id,
          startDate: conflict.startDate,
          endDate: conflict.endDate,
          status: conflict.status,
        },
      });
    }

    const application = await LeaveApplication.create({
      ...employeeSnapshot(employee),
      ...leave,
      appliedByRole: "SUPER_ADMIN",
      createdBySuperAdmin: superAdmin._id,
      status: "PENDING",
    });

    return res.status(201).json({
      success: true,
      message: "Leave application created for the selected employee.",
      data: application,
    });
  } catch (error) {
    console.error("SUPER ADMIN CREATE LEAVE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create leave application for employee.",
    });
  }
}

/* =====================================================
   SUPER ADMIN: LIST ALL APPLICATIONS
   GET /api/leaves/admin
===================================================== */

async function adminLeaves(req, res) {
  try {
    const page = paginationValue(req.query.page, 1, 100000);
    const limit = paginationValue(req.query.limit, 10, 100);
    const filter = {};

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();

      if (!LEAVE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leave status.",
        });
      }

      filter.status = status;
    }

    if (req.query.leaveType) {
      const type = String(req.query.leaveType).toUpperCase();

      if (!LEAVE_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid leave type.",
        });
      }

      filter.leaveType = type;
    }

    const { from, to } = req.query;

    if (
      (from && !validDateString(from)) ||
      (to && !validDateString(to))
    ) {
      return res.status(400).json({
        success: false,
        message: "Filter dates must use YYYY-MM-DD format.",
      });
    }

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "'from' date cannot be after 'to' date.",
      });
    }

    // Include applications whose leave period overlaps the filter window.
    if (from || to) {
      filter.startDate = {};
      filter.endDate = {};

      if (to) filter.startDate.$lte = to;
      if (from) filter.endDate.$gte = from;
    }

    if (req.query.search && String(req.query.search).trim()) {
      const search = String(req.query.search).trim().slice(0, 100);
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      filter.$or = [
        { employeeName: regex },
        { employeeCode: regex },
        { employeeEmail: regex },
        { branch: regex },
      ];
    }

    const [data, total, pending, approved, rejected, cancelled] =
      await Promise.all([
        LeaveApplication.find(filter)
          .populate("reviewedBy", "name email")
          .populate("createdBySuperAdmin", "name email")
          .sort({ appliedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        LeaveApplication.countDocuments(filter),
        LeaveApplication.countDocuments({ ...filter, status: "PENDING" }),
        LeaveApplication.countDocuments({ ...filter, status: "APPROVED" }),
        LeaveApplication.countDocuments({ ...filter, status: "REJECTED" }),
        LeaveApplication.countDocuments({ ...filter, status: "CANCELLED" }),
      ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
      summary: {
        total,
        pending,
        approved,
        rejected,
        cancelled,
      },
    });
  } catch (error) {
    console.error("ADMIN LEAVES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave applications.",
    });
  }
}

/* =====================================================
   SUPER ADMIN: VIEW ONE APPLICATION
   GET /api/leaves/admin/:id
===================================================== */

async function adminLeaveById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave application ID.",
      });
    }

    const application = await LeaveApplication.findById(req.params.id)
      .populate("reviewedBy", "name email")
      .populate("createdBySuperAdmin", "name email")
      .lean();

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Leave application not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("ADMIN LEAVE DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave application.",
    });
  }
}

/* =====================================================
   SUPER ADMIN: APPROVE OR REJECT
   PATCH /api/leaves/admin/:id/review
===================================================== */

async function reviewLeave(req, res) {
  try {
    const superAdmin = req.superAdmin;
    const { id } = req.params;
    const status = String(req.body?.status || "").trim().toUpperCase();
    const note =
      typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (!superAdmin?._id) {
      return res.status(403).json({
        success: false,
        message: "Authenticated Super Admin information is missing.",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave application ID.",
      });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Review status must be APPROVED or REJECTED.",
      });
    }

    if (note.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Review note cannot exceed 1000 characters.",
      });
    }

    if (status === "REJECTED" && !note) {
      return res.status(400).json({
        success: false,
        message: "A rejection reason is required.",
      });
    }

    // Atomically review only pending requests. This prevents two admins
    // from approving/rejecting the same pending request simultaneously.
    const application = await LeaveApplication.findOneAndUpdate(
      {
        _id: id,
        status: "PENDING",
      },
      {
        $set: {
          status,
          reviewNote: note,
          reviewedBy: superAdmin._id,
          reviewedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("reviewedBy", "name email");

    if (!application) {
      const existing = await LeaveApplication.findById(id).lean();

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Leave application not found.",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Only pending leave applications can be reviewed.",
        currentStatus: existing.status,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Leave application ${status.toLowerCase()} successfully.`,
      data: application,
    });
  } catch (error) {
    console.error("REVIEW LEAVE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review leave application.",
    });
  }
}

module.exports = {
  applyLeave,
  myLeaves,
  myLeaveById,
  cancelLeave,
  adminEmployees,
  adminCreateLeave,
  adminLeaves,
  adminLeaveById,
  reviewLeave,
};