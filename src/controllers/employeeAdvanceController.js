
"use strict";

const mongoose = require("mongoose");
const admin = require("../config/firebase");
const Employee = require("../models/Employee");
const SuperAdmin = require("../models/SuperAdmin");
const EmployeeAdvance = require("../models/EmployeeAdvance");

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const validObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));

const validMonth = (value) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const adminId = (req) => req.superAdmin?._id || null;

function addHistory(advance, action, role, note = "", performedBy = null, metadata = {}) {
  advance.history.push({
    action,
    performedBy,
    performedByRole: role,
    note,
    metadata,
    createdAt: new Date(),
  });
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

// Verify Firebase authentication for employee-facing endpoints.
async function authenticateEmployee(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return sendError(res, 401, "Firebase authentication token is required.");
    }

    const token = header.slice(7).trim();

    if (!token) {
      return sendError(res, 401, "Authentication token is missing.");
    }

    const decoded = await admin.auth().verifyIdToken(token, true);
    const employee = await Employee.findOne({
      firebaseUid: decoded.uid,
    });

    if (!employee) {
      return sendError(res, 403, "Employee account was not found.");
    }

    if (
      employee.status &&
      String(employee.status).toUpperCase() !== "ACTIVE"
    ) {
      return sendError(res, 403, "Your employee account is not active.");
    }

    req.user = decoded;
    req.employee = employee;

    return next();
  } catch (error) {
    console.error("EMPLOYEE ADVANCE AUTH ERROR:", error.code || error.message);

    if (String(error.code || "").startsWith("auth/")) {
      return sendError(res, 401, "Invalid or expired Firebase token.");
    }

    return sendError(res, 500, "Unable to authenticate employee.");
  }
}

function getEmployeeSnapshot(employee) {
  return {
    employee: employee._id,
    employeeCode: employee.employeeCode || employee.employeeId || employee.code || "",
    employeeName:
      employee.name ||
      employee.fullName ||
      [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
      employee.email ||
      "Employee",
  };
}

// Employee: submit an advance request.
async function createEmployeeRequest(req, res) {
  try {
    const amount = Number(req.body.amount ?? req.body.requestedAmount);
    const reason = String(req.body.reason || "").trim();
    const repaymentMonths = Number(req.body.repaymentMonths || 1);

    if (!Number.isFinite(amount) || amount < 1 || amount > 100000000) {
      return sendError(res, 400, "Enter a valid advance amount.");
    }

    if (reason.length < 5 || reason.length > 2000) {
      return sendError(res, 400, "Reason must be between 5 and 2000 characters.");
    }

    if (
      !Number.isInteger(repaymentMonths) ||
      repaymentMonths < 1 ||
      repaymentMonths > 60
    ) {
      return sendError(res, 400, "Repayment period must be between 1 and 60 months.");
    }

    const snapshot = getEmployeeSnapshot(req.employee);

    const advance = new EmployeeAdvance({
      ...snapshot,
      requestedBy: req.employee._id,
      requestedAmount: roundMoney(amount),
      reason,
      repaymentMonths,
      status: "PENDING",
      source: "EMPLOYEE_REQUEST",
    });

    addHistory(
      advance,
      "REQUESTED",
      "EMPLOYEE",
      "Employee submitted an advance request.",
      req.employee._id,
      { requestedAmount: advance.requestedAmount }
    );

    await advance.save();

    return res.status(201).json({
      success: true,
      message: "Advance request submitted for Super Admin review.",
      data: advance,
    });
  } catch (error) {
    console.error("CREATE EMPLOYEE ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to submit advance request.");
  }
}

// Employee: view only their own advance requests.
async function listMyRequests(req, res) {
  try {
    const items = await EmployeeAdvance.find({
      employee: req.employee._id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("LIST MY ADVANCES ERROR:", error);
    return sendError(res, 500, "Unable to load your advance requests.");
  }
}

// Super Admin: list advance requests with filters and pagination.
async function listAdminRequests(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = {};

    if (req.query.status) {
      const allowedStatuses = [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "DISBURSED",
        "PARTIALLY_REPAID",
        "REPAID",
        "CANCELLED",
      ];

      const status = String(req.query.status).toUpperCase();

      if (!allowedStatuses.includes(status)) {
        return sendError(res, 400, "Invalid advance status filter.");
      }

      filter.status = status;
    }

    if (req.query.employeeId) {
      if (!validObjectId(req.query.employeeId)) {
        return sendError(res, 400, "Invalid employee ID.");
      }

      filter.employee = req.query.employeeId;
    }

    const [items, total] = await Promise.all([
      EmployeeAdvance.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("employee", "name fullName employeeCode employeeId email"),
      EmployeeAdvance.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("LIST ADMIN ADVANCES ERROR:", error);
    return sendError(res, 500, "Unable to load advance requests.");
  }
}

// Super Admin: create an advance directly for an employee.
// Creation does not imply payment. Approval and disbursement remain separate.
async function createAdminAdvance(req, res) {
  try {
    const { employeeId } = req.body;
    const amount = Number(req.body.amount ?? req.body.requestedAmount);
    const reason = String(req.body.reason || "").trim();
    const repaymentMonths = Number(req.body.repaymentMonths || 1);

    if (!validObjectId(employeeId)) {
      return sendError(res, 400, "A valid employee ID is required.");
    }

    if (!Number.isFinite(amount) || amount < 1 || amount > 100000000) {
      return sendError(res, 400, "Enter a valid advance amount.");
    }

    if (reason.length < 5 || reason.length > 2000) {
      return sendError(res, 400, "Reason must be between 5 and 2000 characters.");
    }

    if (!Number.isInteger(repaymentMonths) || repaymentMonths < 1 || repaymentMonths > 60) {
      return sendError(res, 400, "Repayment period must be between 1 and 60 months.");
    }

    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return sendError(res, 404, "Employee not found.");
    }

    if (employee.status && String(employee.status).toUpperCase() !== "ACTIVE") {
      return sendError(res, 400, "Cannot create an advance for an inactive employee.");
    }

    const snapshot = getEmployeeSnapshot(employee);
    const advance = new EmployeeAdvance({
      ...snapshot,
      requestedBy: null,
      requestedAmount: roundMoney(amount),
      reason,
      repaymentMonths,
      source: "SUPER_ADMIN",
      status: "PENDING",
      createdBy: adminId(req),
      updatedBy: adminId(req),
    });

    addHistory(
      advance,
      "CREATED_BY_ADMIN",
      "SUPER_ADMIN",
      "Super Admin created an advance for the employee; approval is still required.",
      adminId(req),
      { requestedAmount: advance.requestedAmount }
    );

    await advance.save();

    return res.status(201).json({
      success: true,
      message: "Advance request created. Approve it before disbursement.",
      data: advance,
    });
  } catch (error) {
    console.error("ADMIN CREATE ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to create employee advance.");
  }
}

// Super Admin: approve a pending request.
async function approveAdvance(req, res) {
  try {
    const { id } = req.params;
    const approvedAmount = Number(
      req.body.approvedAmount ?? req.body.amount
    );
    const repaymentMonths = Number(req.body.repaymentMonths || 1);
    const repaymentStartMonth = String(
      req.body.repaymentStartMonth || currentMonth()
    );

    if (!validObjectId(id)) {
      return sendError(res, 400, "Invalid advance ID.");
    }

    if (!Number.isFinite(approvedAmount) || approvedAmount < 1) {
      return sendError(res, 400, "Enter a valid approved amount.");
    }

    if (!Number.isInteger(repaymentMonths) || repaymentMonths < 1 || repaymentMonths > 60) {
      return sendError(res, 400, "Repayment period must be between 1 and 60 months.");
    }

    if (!validMonth(repaymentStartMonth)) {
      return sendError(res, 400, "Repayment start month must use YYYY-MM format.");
    }

    const advance = await EmployeeAdvance.findById(id);

    if (!advance) return sendError(res, 404, "Advance request not found.");

    if (advance.status !== "PENDING") {
      return sendError(res, 409, `Cannot approve an advance with status ${advance.status}.`);
    }

    if (approvedAmount > advance.requestedAmount) {
      return sendError(res, 400, "Approved amount cannot exceed the requested amount.");
    }

    advance.approvedAmount = roundMoney(approvedAmount);
    advance.repaymentMonths = repaymentMonths;
    advance.repaymentStartMonth = repaymentStartMonth;
    advance.monthlyInstallment = roundMoney(
      advance.approvedAmount / repaymentMonths
    );
    advance.status = "APPROVED";
    advance.reviewedBy = adminId(req);
    advance.reviewedAt = new Date();
    advance.updatedBy = adminId(req);

    addHistory(
      advance,
      "APPROVED",
      "SUPER_ADMIN",
      String(req.body.note || "Advance request approved.").trim(),
      adminId(req),
      {
        approvedAmount: advance.approvedAmount,
        repaymentMonths,
        repaymentStartMonth,
      }
    );

    await advance.save();

    return res.json({
      success: true,
      message: "Advance approved. Record the actual payment separately.",
      data: advance,
    });
  } catch (error) {
    console.error("APPROVE ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to approve advance request.");
  }
}

// Super Admin: reject a pending request with a reason.
async function rejectAdvance(req, res) {
  try {
    if (!validObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid advance ID.");
    }

    const reason = String(req.body.reason || "").trim();

    if (reason.length < 3) {
      return sendError(res, 400, "Provide a rejection reason of at least 3 characters.");
    }

    const advance = await EmployeeAdvance.findById(req.params.id);

    if (!advance) return sendError(res, 404, "Advance request not found.");

    if (advance.status !== "PENDING") {
      return sendError(res, 409, `Cannot reject an advance with status ${advance.status}.`);
    }

    advance.status = "REJECTED";
    advance.rejectionReason = reason;
    advance.reviewedBy = adminId(req);
    advance.reviewedAt = new Date();
    advance.updatedBy = adminId(req);

    addHistory(
      advance,
      "REJECTED",
      "SUPER_ADMIN",
      reason,
      adminId(req)
    );

    await advance.save();

    return res.json({
      success: true,
      message: "Advance request rejected.",
      data: advance,
    });
  } catch (error) {
    console.error("REJECT ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to reject advance request.");
  }
}

// Super Admin: record actual payment of an approved advance.
async function disburseAdvance(req, res) {
  try {
    if (!validObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid advance ID.");
    }

    const amount = Number(req.body.disbursedAmount ?? req.body.amount);
    const paymentReference = String(req.body.paymentReference || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return sendError(res, 400, "Enter a valid disbursed amount.");
    }

    if (!paymentReference) {
      return sendError(res, 400, "Payment reference is required.");
    }

    const advance = await EmployeeAdvance.findById(req.params.id);

    if (!advance) return sendError(res, 404, "Advance request not found.");

    if (advance.status !== "APPROVED") {
      return sendError(res, 409, "Only approved advances can be disbursed.");
    }

    if (amount > Number(advance.approvedAmount || 0)) {
      return sendError(res, 400, "Disbursed amount cannot exceed the approved amount.");
    }

    advance.disbursedAmount = roundMoney(amount);
    advance.paymentReference = paymentReference;
    advance.disbursedBy = adminId(req);
    advance.disbursedAt = new Date();
    advance.status = "DISBURSED";
    advance.updatedBy = adminId(req);

    addHistory(
      advance,
      "DISBURSED",
      "SUPER_ADMIN",
      String(req.body.note || "Advance payment recorded.").trim(),
      adminId(req),
      {
        disbursedAmount: advance.disbursedAmount,
        paymentReference,
      }
    );

    await advance.save();

    return res.json({
      success: true,
      message: "Advance disbursement recorded.",
      data: advance,
    });
  } catch (error) {
    console.error("DISBURSE ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to record advance payment.");
  }
}

// Super Admin: view details and history.
async function getAdvanceById(req, res) {
  try {
    if (!validObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid advance ID.");
    }

    const advance = await EmployeeAdvance.findById(req.params.id)
      .populate("employee", "name fullName employeeCode employeeId email")
      .populate("reviewedBy", "name email")
      .populate("disbursedBy", "name email");

    if (!advance) return sendError(res, 404, "Advance record not found.");

    return res.json({ success: true, data: advance });
  } catch (error) {
    console.error("GET ADVANCE ERROR:", error);
    return sendError(res, 500, "Unable to load advance details.");
  }
}

module.exports = {
  authenticateEmployee,
  createEmployeeRequest,
  listMyRequests,
  listAdminRequests,
  createAdminAdvance,
  approveAdvance,
  rejectAdvance,
  disburseAdvance,
  getAdvanceById,
};
