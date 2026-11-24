
"use strict";

const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const EmployeeSalary = require("../models/EmployeeSalary");
const MonthlyPayroll = require("../models/MonthlyPayroll");
const Attendance = require("../models/Attendance");

const LeaveApplication = (() => {
  try {
    return require("../models/LeaveApplication");
  } catch {
    return null;
  }
})();

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getAdminId = (req) =>
  req.superAdmin?._id ||
  req.user?.superAdminId ||
  req.user?._id ||
  null;

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

function getMonthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
    throw new Error("Payroll month must use YYYY-MM format.");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
    lastDay: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
  };
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function getAttendanceDate(record) {
  const value =
    record.attendanceDate ||
    record.date ||
    record.checkInDate ||
    record.createdAt;

  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getAttendanceStatus(record) {
  return normalizeStatus(
    record.status ||
    record.attendanceStatus ||
    record.dayStatus ||
    record.mark
  );
}

function isSameUtcDay(first, second) {
  return (
    first.getUTCFullYear() === second.getUTCFullYear() &&
    first.getUTCMonth() === second.getUTCMonth() &&
    first.getUTCDate() === second.getUTCDate()
  );
}

function calculateAttendanceSummary(records, start, end) {
  const uniqueDays = new Map();

  for (const record of records) {
    const date = getAttendanceDate(record);

    if (!date || date < start || date >= end) continue;

    const status = getAttendanceStatus(record);
    const key = date.toISOString().slice(0, 10);

    // Prefer a full present record over a half-day duplicate.
    const existing = uniqueDays.get(key);

    if (!existing) {
      uniqueDays.set(key, { status, record });
    } else if (
      ["PRESENT", "FULL_DAY", "ON_TIME", "LATE"].includes(status)
    ) {
      uniqueDays.set(key, { status, record });
    }
  }

  const summary = {
    presentDays: 0,
    halfDays: 0,
    absentDays: 0,
    weeklyOffDays: 0,
    holidayDays: 0,
  };

  for (const { status } of uniqueDays.values()) {
    if (
      ["PRESENT", "FULL_DAY", "ON_TIME", "LATE"].includes(status)
    ) {
      summary.presentDays += 1;
    } else if (
      ["HALF_DAY", "HALFDAY", "HALF"].includes(status)
    ) {
      summary.halfDays += 1;
    } else if (
      ["ABSENT", "A"].includes(status)
    ) {
      summary.absentDays += 1;
    } else if (
      ["WEEKLY_OFF", "WEEK_OFF", "WEEKLYOFF"].includes(status)
    ) {
      summary.weeklyOffDays += 1;
    } else if (
      ["HOLIDAY", "PUBLIC_HOLIDAY"].includes(status)
    ) {
      summary.holidayDays += 1;
    }
  }

  return summary;
}

function calculateSalary(salary, attendance, leaveDays, range) {
  const {
    presentDays,
    halfDays,
    absentDays,
    weeklyOffDays,
    holidayDays,
  } = attendance;

  const grossSalary = roundMoney(
    Number(salary.basicSalary || 0) +
    Number(salary.hra || 0) +
    Number(salary.conveyanceAllowance || 0) +
    Number(salary.otherAllowances || 0)
  );

  let divisor;

  if (salary.salaryCalculationMethod === "FIXED_30") {
    divisor = 30;
  } else if (salary.salaryCalculationMethod === "CALENDAR_DAYS") {
    divisor = range.lastDay;
  } else {
    divisor = Number(salary.standardWorkingDays || 26);
  }

  const dailySalary = divisor > 0 ? grossSalary / divisor : 0;

  const paidLeaveDays = salary.paidLeaveEnabled
    ? leaveDays.paid
    : 0;

  const unpaidLeaveDays = salary.deductUnpaidLeave
    ? leaveDays.unpaid
    : 0;

  const halfDayEquivalent = halfDays * Number(salary.halfDayFactor ?? 0.5);

  const payableDays = Math.max(
    0,
    presentDays +
      halfDayEquivalent +
      weeklyOffDays +
      holidayDays +
      paidLeaveDays -
      unpaidLeaveDays
  );

  const absenceDeduction = salary.deductUnapprovedAbsence
    ? roundMoney(absentDays * dailySalary)
    : 0;

  const unpaidLeaveDeduction = roundMoney(
    unpaidLeaveDays * dailySalary
  );

  const attendanceDeduction = absenceDeduction;

  const attendanceEarnings = roundMoney(
    Math.min(1, payableDays / divisor) * grossSalary
  );

  const professionalTax = Number(salary.professionalTax || 0);
  const providentFund = Number(salary.providentFund || 0);
  const otherDeductions = Number(salary.otherDeductions || 0);

  const totalDeductions = roundMoney(
    attendanceDeduction +
      unpaidLeaveDeduction +
      professionalTax +
      providentFund +
      otherDeductions
  );

  // Avoid deducting the same absence twice. Attendance earnings are
  // used as the gross payable base; absence/unpaid deductions are
  // informational and must not be subtracted again.
  const netSalary = roundMoney(
    Math.max(
      0,
      attendanceEarnings -
        professionalTax -
        providentFund -
        otherDeductions
    )
  );

  return {
    grossSalary,
    totalCalendarDays: range.lastDay,
    totalWorkingDays: divisor,
    presentDays,
    halfDays,
    absentDays,
    weeklyOffDays,
    holidayDays,
    paidLeaveDays,
    unpaidLeaveDays,
    payableDays: roundMoney(payableDays),
    salaryDivisor: divisor,
    dailySalary: roundMoney(dailySalary),
    attendanceEarnings,
    attendanceDeduction,
    unpaidLeaveDeduction,
    absenceDeduction,
    professionalTax,
    providentFund,
    otherDeductions,
    totalDeductions,
    netSalary,
  };
}

async function getLeaveDays(employeeId, start, end) {
  const result = { paid: 0, unpaid: 0 };

  if (!LeaveApplication) return result;

  const leaves = await LeaveApplication.find({
    employee: employeeId,
    status: "APPROVED",
    startDate: { $lt: end.toISOString().slice(0, 10) },
    endDate: { $gte: start.toISOString().slice(0, 10) },
  }).lean();

  for (const leave of leaves) {
    const type = normalizeStatus(leave.leaveType);
    const days = Number(leave.totalDays || 0);

    if (["UNPAID", "LOSS_OF_PAY", "LOP"].includes(type)) {
      result.unpaid += days;
    } else {
      result.paid += days;
    }
  }

  return result;
}

// GET /api/payroll/admin/employees
exports.getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({
      status: { $ne: "DELETED" },
    })
      .select("_id name fullName employeeName employeeCode email branch branchName status")
      .sort({ name: 1 })
      .lean();

    return res.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error("Payroll employees error:", error);
    return sendError(res, 500, "Unable to load employees.");
  }
};

// GET /api/payroll/admin/salaries
exports.listSalaries = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};

    if (req.query.status) filter.status = req.query.status;

    const [data, total] = await Promise.all([
      EmployeeSalary.find(filter)
        .populate("employee", "name fullName employeeName employeeCode email")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmployeeSalary.countDocuments(filter),
    ]);

    return res.json({
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
    console.error("Payroll salary list error:", error);
    return sendError(res, 500, "Unable to load salary settings.");
  }
};

// PUT /api/payroll/admin/salaries/:employeeId
exports.setEmployeeSalary = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!mongoose.isValidObjectId(employeeId)) {
      return sendError(res, 400, "Invalid employee ID.");
    }

    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return sendError(res, 404, "Employee not found.");
    }

    const numericFields = [
      "basicSalary",
      "hra",
      "conveyanceAllowance",
      "otherAllowances",
      "professionalTax",
      "providentFund",
      "otherDeductions",
      "standardWorkingDays",
      "halfDayFactor",
    ];

    for (const field of numericFields) {
      if (
        req.body[field] !== undefined &&
        (!Number.isFinite(Number(req.body[field])) ||
          Number(req.body[field]) < 0)
      ) {
        return sendError(res, 400, `${field} must be a valid non-negative number.`);
      }
    }

    const allowedFields = [
      ...numericFields,
      "salaryCalculationMethod",
      "paidLeaveEnabled",
      "deductUnpaidLeave",
      "deductUnapprovedAbsence",
      "effectiveFrom",
      "effectiveTo",
      "status",
      "notes",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (!update.basicSalary && update.basicSalary !== 0) {
      const existing = await EmployeeSalary.findOne({ employee: employeeId });

      if (!existing) {
        return sendError(res, 400, "basicSalary is required.");
      }
    }

    update.employeeCode = employee.employeeCode || employee.code || "";
    update.employeeName =
      employee.name ||
      employee.fullName ||
      employee.employeeName ||
      "";
    update.branch = employee.branchName || employee.branch || "";
    update.updatedBy = getAdminId(req);

    if (!req.body.effectiveFrom) {
      update.effectiveFrom = new Date();
    }

    const salary = await EmployeeSalary.findOneAndUpdate(
      { employee: employeeId },
      {
        $set: update,
        $setOnInsert: {
          employee: employeeId,
          createdBy: getAdminId(req),
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Employee salary saved successfully.",
      data: salary,
    });
  } catch (error) {
    console.error("Set employee salary error:", error);

    if (error.name === "ValidationError") {
      return sendError(res, 400, error.message);
    }

    return sendError(res, 500, "Unable to save employee salary.");
  }
};

// POST /api/payroll/admin/generate
// Body: { "payrollMonth": "2026-10" }
exports.generateMonthlyPayroll = async (req, res) => {
  try {
    const { payrollMonth } = req.body;
    const range = getMonthRange(payrollMonth);

    const salaries = await EmployeeSalary.find({
      status: "ACTIVE",
      effectiveFrom: { $lt: range.end },
      $or: [
        { effectiveTo: null },
        { effectiveTo: { $gte: range.start } },
      ],
    }).lean();

    if (!salaries.length) {
      return res.json({
        success: true,
        message: "No active employee salary settings found for this month.",
        data: [],
      });
    }

    const generated = [];
    const skipped = [];

    for (const salary of salaries) {
      const existing = await MonthlyPayroll.findOne({
        employee: salary.employee,
        payrollMonth,
      });

      if (
        existing &&
        ["APPROVED", "PAID", "CANCELLED"].includes(existing.status)
      ) {
        skipped.push({
          employee: salary.employee,
          reason: `Payroll is already ${existing.status}.`,
        });
        continue;
      }

      const attendanceRecords = await Attendance.find({
        employee: salary.employee,
      }).lean();

      const attendance = calculateAttendanceSummary(
        attendanceRecords,
        range.start,
        range.end
      );

      const leaveDays = await getLeaveDays(
        salary.employee,
        range.start,
        range.end
      );

      const calculated = calculateSalary(
        salary,
        attendance,
        leaveDays,
        range
      );

      const employee = await Employee.findById(salary.employee).lean();

      const payrollData = {
        employee: salary.employee,
        employeeSalary: salary._id,
        employeeCode: salary.employeeCode || "",
        employeeName:
          salary.employeeName ||
          employee?.name ||
          employee?.fullName ||
          employee?.employeeName ||
          "",
        branch: salary.branch || employee?.branchName || employee?.branch || "",
        payrollMonth,
        periodStart: range.start,
        periodEnd: new Date(range.end.getTime() - 1),
        basicSalary: salary.basicSalary,
        hra: salary.hra || 0,
        conveyanceAllowance: salary.conveyanceAllowance || 0,
        otherAllowances: salary.otherAllowances || 0,
        ...calculated,
        status: "CALCULATED",
        calculatedAt: new Date(),
        updatedBy: getAdminId(req),
        createdBy: getAdminId(req),
      };

      const record = await MonthlyPayroll.findOneAndUpdate(
        {
          employee: salary.employee,
          payrollMonth,
          status: { $nin: ["APPROVED", "PAID", "CANCELLED"] },
        },
        {
          $set: payrollData,
          $setOnInsert: {
            employee: salary.employee,
            payrollMonth,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      generated.push(record);
    }

    return res.json({
      success: true,
      message: "Monthly payroll calculation completed.",
      data: generated,
      skipped,
      summary: {
        generated: generated.length,
        skipped: skipped.length,
      },
    });
  } catch (error) {
    console.error("Generate payroll error:", error);
    return sendError(res, 500, error.message || "Unable to generate payroll.");
  }
};

// GET /api/payroll/admin?payrollMonth=2026-10
exports.listMonthlyPayroll = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};

    if (req.query.payrollMonth) {
      filter.payrollMonth = req.query.payrollMonth;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.employee) {
      if (!mongoose.isValidObjectId(req.query.employee)) {
        return sendError(res, 400, "Invalid employee ID.");
      }

      filter.employee = req.query.employee;
    }

    const [data, total, totals] = await Promise.all([
      MonthlyPayroll.find(filter)
        .populate("employee", "name fullName employeeName employeeCode email")
        .sort({ payrollMonth: -1, employeeName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MonthlyPayroll.countDocuments(filter),
      MonthlyPayroll.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            grossSalary: { $sum: "$grossSalary" },
            totalDeductions: { $sum: "$totalDeductions" },
            netSalary: { $sum: "$netSalary" },
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      data,
      totals: totals[0] || {
        grossSalary: 0,
        totalDeductions: 0,
        netSalary: 0,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List payroll error:", error);
    return sendError(res, 500, "Unable to load monthly payroll.");
  }
};

// GET /api/payroll/admin/:id
exports.getPayrollById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid payroll ID.");
    }

    const payroll = await MonthlyPayroll.findById(req.params.id)
      .populate("employee")
      .populate("employeeSalary")
      .populate("approvedBy", "name email")
      .populate("paidBy", "name email");

    if (!payroll) {
      return sendError(res, 404, "Payroll record not found.");
    }

    return res.json({ success: true, data: payroll });
  } catch (error) {
    console.error("Get payroll details error:", error);
    return sendError(res, 500, "Unable to load payroll details.");
  }
};

// PATCH /api/payroll/admin/:id/approve
exports.approvePayroll = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid payroll ID.");
    }

    const payroll = await MonthlyPayroll.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "CALCULATED",
      },
      {
        $set: {
          status: "APPROVED",
          approvedBy: getAdminId(req),
          approvedAt: new Date(),
          updatedBy: getAdminId(req),
        },
      },
      { new: true, runValidators: true }
    );

    if (!payroll) {
      return sendError(
        res,
        409,
        "Payroll was not found or is not in CALCULATED status."
      );
    }

    return res.json({
      success: true,
      message: "Payroll approved successfully.",
      data: payroll,
    });
  } catch (error) {
    console.error("Approve payroll error:", error);
    return sendError(res, 500, "Unable to approve payroll.");
  }
};

// PATCH /api/payroll/admin/:id/mark-paid
// Body: { "paymentReference": "BANK-TRANSFER-REFERENCE" }
exports.markPayrollPaid = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid payroll ID.");
    }

    const paymentReference = String(
      req.body.paymentReference || ""
    ).trim();

    if (!paymentReference) {
      return sendError(res, 400, "Payment reference is required.");
    }

    const payroll = await MonthlyPayroll.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "APPROVED",
      },
      {
        $set: {
          status: "PAID",
          paymentReference,
          paidBy: getAdminId(req),
          paidAt: new Date(),
          updatedBy: getAdminId(req),
        },
      },
      { new: true, runValidators: true }
    );

    if (!payroll) {
      return sendError(
        res,
        409,
        "Payroll was not found or has not been approved."
      );
    }

    return res.json({
      success: true,
      message: "Payroll marked as paid.",
      data: payroll,
    });
  } catch (error) {
    console.error("Mark payroll paid error:", error);
    return sendError(res, 500, "Unable to mark payroll as paid.");
  }
};
