
"use strict";

const mongoose = require("mongoose");
const firebaseAdmin = require("../config/firebase");
const Employee = require("../models/Employee");
const EODReport = require("../models/EODReport");

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function getFirebaseAuth() {
  const admin =
    firebaseAdmin && firebaseAdmin.default
      ? firebaseAdmin.default
      : firebaseAdmin;

  if (!admin || typeof admin.auth !== "function") {
    throw new Error(
      "Firebase Admin is not initialized correctly in src/config/firebase.js"
    );
  }

  return admin.auth();
}

function getName(employee) {
  return (
    employee.fullName ||
    employee.name ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.email ||
    "Employee"
  );
}

function getBranch(employee) {
  const branch = employee.branch || employee.branchId || null;

  return {
    id:
      branch && typeof branch === "object"
        ? branch._id || branch.id || null
        : branch,
    name:
      employee.branchName ||
      (branch && typeof branch === "object"
        ? branch.name || branch.branchName || ""
        : ""),
  };
}

function getManagerId(employee) {
  const manager =
    employee.manager ||
    employee.managerId ||
    employee.reportingManager ||
    employee.reportingManagerId ||
    null;

  if (!manager) return null;

  return typeof manager === "object"
    ? manager._id || manager.id || null
    : manager;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function normalizeText(value, field, max = 10000) {
  if (value === undefined || value === null) value = "";

  if (typeof value !== "string") {
    const error = new Error(`${field} must be text.`);
    error.status = 400;
    throw error;
  }

  const result = value.trim();

  if (result.length > max) {
    const error = new Error(
      `${field} cannot exceed ${max} characters.`
    );
    error.status = 400;
    throw error;
  }

  return result;
}

function normalizeCount(value, field) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const count = Number(value);

  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    const error = new Error(
      `${field} must be a whole number between 0 and 10000.`
    );
    error.status = 400;
    throw error;
  }

  return count;
}

function responseError(res, error, fallback = "Request failed.") {
  if (!error.status) {
    console.error("EOD controller error:", error);
  }

  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : fallback,
  });
}

function currentActor(req) {
  if (req.superAdmin) {
    return {
      id: req.superAdmin._id,
      name: getName(req.superAdmin),
      role: "SUPER_ADMIN",
    };
  }

  return {
    id: req.employee._id,
    name: getName(req.employee),
    role: req.eodRole,
  };
}

function reportPayload(body = {}) {
  const reportDate = parseDate(body.reportDate);

  if (!reportDate) {
    const error = new Error(
      "A valid reportDate in YYYY-MM-DD format is required."
    );
    error.status = 400;
    throw error;
  }

  const workCompleted = normalizeText(
    body.workCompleted,
    "Work completed"
  );

  const tomorrowPlan = normalizeText(
    body.tomorrowPlan,
    "Tomorrow's action plan"
  );

  if (!workCompleted) {
    const error = new Error(
      "Please describe the work completed today."
    );
    error.status = 400;
    throw error;
  }

  if (!tomorrowPlan) {
    const error = new Error(
      "Please provide tomorrow's action plan."
    );
    error.status = 400;
    throw error;
  }

  return {
    reportDate,
    callsLogged: normalizeCount(
      body.callsLogged,
      "Calls logged"
    ),
    clientVisits: normalizeCount(
      body.clientVisits,
      "Client visits"
    ),
    workCompleted,
    tasksPending: normalizeText(
      body.tasksPending,
      "Pending tasks"
    ),
    impediments: normalizeText(
      body.impediments,
      "Impediments"
    ),
    tomorrowPlan,
    additionalNotes: normalizeText(
      body.additionalNotes,
      "Additional notes"
    ),
  };
}

function addHistory(report, action, actor, note = "") {
  report.history.push({
    action,
    performedBy: actor.id,
    performedByRole: actor.role,
    note,
    createdAt: new Date(),
  });
}

function employeeSnapshot(employee) {
  const branch = getBranch(employee);

  return {
    employee: employee._id,
    employeeUid: employee.firebaseUid,
    employeeName: getName(employee),
    employeeCode:
      employee.employeeCode ||
      employee.employeeId ||
      employee.code ||
      "",
    branch: branch.id || null,
    branchName: branch.name,
    manager: getManagerId(employee),
  };
}

function getPagination(req) {
  const page = Math.max(
    1,
    Number.parseInt(req.query.page, 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function addFilters(query, req) {
  if (req.query.status) {
    const allowedStatuses = [
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "CHANGES_REQUESTED",
    ];

    const status = String(req.query.status).toUpperCase();

    if (!allowedStatuses.includes(status)) {
      const error = new Error("Invalid report status.");
      error.status = 400;
      throw error;
    }

    query.status = status;
  }

  if (req.query.from || req.query.to) {
    query.reportDate = {};

    if (req.query.from) {
      const from = parseDate(String(req.query.from));

      if (!from) {
        const error = new Error("Invalid from date.");
        error.status = 400;
        throw error;
      }

      query.reportDate.$gte = from;
    }

    if (req.query.to) {
      const to = parseDate(String(req.query.to));

      if (!to) {
        const error = new Error("Invalid to date.");
        error.status = 400;
        throw error;
      }

      query.reportDate.$lte = to;
    }
  }

  if (req.query.employeeId) {
    if (!mongoose.isValidObjectId(req.query.employeeId)) {
      const error = new Error("Invalid employeeId.");
      error.status = 400;
      throw error;
    }

    query.employee = req.query.employeeId;
  }

  if (req.query.branchId) {
    if (!mongoose.isValidObjectId(req.query.branchId)) {
      const error = new Error("Invalid branchId.");
      error.status = 400;
      throw error;
    }

    query.branch = req.query.branchId;
  }

  if (req.query.reportDate) {
    const reportDate = parseDate(String(req.query.reportDate));

    if (!reportDate) {
      const error = new Error("Invalid reportDate.");
      error.status = 400;
      throw error;
    }

    query.reportDate = reportDate;
  }

  return query;
}

/* -------------------------------------------------------
   AUTHENTICATION MIDDLEWARE

   IMPORTANT:
   This looks up employees by firebaseUid.
   Confirm that your Employee schema uses this field.
------------------------------------------------------- */

async function authenticateStaff(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Firebase authentication token is required.",
      });
    }

    const token = header.slice(7).trim();

    const decoded = await getFirebaseAuth().verifyIdToken(
      token,
      true
    );

    const employee = await Employee.findOne({
      firebaseUid: decoded.uid,
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message:
          "No employee account is linked to this Firebase user.",
      });
    }

    const status = String(
      employee.status || "ACTIVE"
    ).toUpperCase();

    if (
      ["INACTIVE", "DELETED", "DISABLED"].includes(status)
    ) {
      return res.status(403).json({
        success: false,
        message: "Your employee account is not active.",
      });
    }

    const role = String(
      employee.role ||
        employee.userRole ||
        decoded.role ||
        "EMPLOYEE"
    ).toUpperCase();

    if (
      ["SUPER_ADMIN", "ADMIN"].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Use the administrator EOD endpoints.",
      });
    }

    req.employee = employee;
    req.firebaseUser = decoded;
    req.eodRole = role === "MANAGER" ? "MANAGER" : "EMPLOYEE";

    return next();
  } catch (error) {
    console.error(
      "EOD authentication error:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}

function requireManager(req, res, next) {
  if (req.eodRole !== "MANAGER") {
    return res.status(403).json({
      success: false,
      message: "Manager access is required.",
    });
  }

  return next();
}

/* -------------------------------------------------------
   EMPLOYEE: SUBMIT DAILY REPORT
------------------------------------------------------- */

exports.submitReport = async (req, res) => {
  try {
    const data = reportPayload(req.body);
    const employee = req.employee;
    const snapshot = employeeSnapshot(employee);

    const existing = await EODReport.findOne({
      employee: employee._id,
      reportDate: data.reportDate,
    });

    if (existing) {
      if (
        ![
          "REJECTED",
          "CHANGES_REQUESTED",
          "DRAFT",
        ].includes(existing.status)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A report already exists for this date and cannot be resubmitted in its current status.",
          data: existing,
        });
      }

      Object.assign(existing, data, snapshot);

      existing.status = "SUBMITTED";
      existing.submittedAt = new Date();
      existing.reviewedAt = null;
      existing.reviewedBy = null;
      existing.reviewedByName = "";
      existing.reviewNote = "";

      addHistory(
        existing,
        "SUBMITTED",
        currentActor(req),
        "Report resubmitted"
      );

      await existing.save();

      return res.status(200).json({
        success: true,
        message: "Daily work report resubmitted successfully.",
        data: existing,
      });
    }

    const report = new EODReport({
      ...snapshot,
      ...data,
      status: "SUBMITTED",
      submittedAt: new Date(),
    });

    addHistory(
      report,
      "SUBMITTED",
      currentActor(req),
      "Report submitted"
    );

    await report.save();

    return res.status(201).json({
      success: true,
      message: "Daily work report submitted successfully.",
      data: report,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A report already exists for this employee and date.",
      });
    }

    return responseError(
      res,
      error,
      "Unable to submit daily work report."
    );
  }
};

/* -------------------------------------------------------
   EMPLOYEE: LIST OWN REPORTS
------------------------------------------------------- */

exports.myReports = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const query = {
      employee: req.employee._id,
    };

    addFilters(query, req);

    const [items, total] = await Promise.all([
      EODReport.find(query)
        .sort({ reportDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      EODReport.countDocuments(query),
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
    return responseError(
      res,
      error,
      "Unable to load your reports."
    );
  }
};

/* -------------------------------------------------------
   EMPLOYEE: VIEW OWN REPORT
------------------------------------------------------- */

exports.getMyReport = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await EODReport.findOne({
      _id: req.params.id,
      employee: req.employee._id,
    }).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to load the report."
    );
  }
};

/* -------------------------------------------------------
   MANAGER: LIST ASSIGNED REPORTS
------------------------------------------------------- */

exports.managerReports = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const query = {
      manager: req.employee._id,
    };

    addFilters(query, req);

    const [items, total] = await Promise.all([
      EODReport.find(query)
        .sort({ reportDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      EODReport.countDocuments(query),
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
    return responseError(
      res,
      error,
      "Unable to load manager reports."
    );
  }
};

/* -------------------------------------------------------
   MANAGER / SUPER ADMIN: REVIEW REPORT
------------------------------------------------------- */

async function reviewReport(req, res, action) {
  try {
    const { id } = req.params;

    const actor = currentActor(req);

    const note = normalizeText(
      req.body?.note || "",
      "Review note",
      2000
    );

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    if (action !== "APPROVED" && !note) {
      return res.status(400).json({
        success: false,
        message:
          "A reason is required for rejection or requested changes.",
      });
    }

    const query = {
      _id: id,
    };

    // Restrict manager reviews to their assigned reports.
    if (actor.role === "MANAGER") {
      query.manager = actor.id;
    }

    const report = await EODReport.findOne(query);

    if (!report) {
      return res.status(404).json({
        success: false,
        message:
          "Report not found or you are not authorized to review it.",
      });
    }

    if (
      !["SUBMITTED", "UNDER_REVIEW"].includes(report.status)
    ) {
      return res.status(409).json({
        success: false,
        message:
          `A report with status ${report.status} cannot be reviewed.`,
      });
    }

    report.status = action;
    report.reviewedAt = new Date();
    report.reviewedBy = actor.id;
    report.reviewedByName = actor.name;
    report.reviewNote = note;

    addHistory(report, action, actor, note);

    await report.save();

    return res.json({
      success: true,
      message:
        action === "APPROVED"
          ? "EOD report approved successfully."
          : action === "REJECTED"
            ? "EOD report rejected."
            : "Changes requested successfully.",
      data: report,
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to review report."
    );
  }
}

exports.approveReport = (req, res) =>
  reviewReport(req, res, "APPROVED");

exports.rejectReport = (req, res) =>
  reviewReport(req, res, "REJECTED");

exports.requestChanges = (req, res) =>
  reviewReport(req, res, "CHANGES_REQUESTED");

/* -------------------------------------------------------
   SUPER ADMIN: ALL REPORTS
------------------------------------------------------- */

exports.adminReports = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const query = {};

    addFilters(query, req);

    if (req.query.search) {
      const search = String(req.query.search)
        .trim()
        .slice(0, 100);

      if (search) {
        const escaped = search.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        const regex = new RegExp(escaped, "i");

        query.$or = [
          { employeeName: regex },
          { employeeCode: regex },
          { branchName: regex },
        ];
      }
    }

    const [items, total, statusCounts] = await Promise.all([
      EODReport.find(query)
        .sort({ reportDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      EODReport.countDocuments(query),

      EODReport.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = statusCounts.reduce((result, item) => {
      result[item._id] = item.count;
      return result;
    }, {});

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary,
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to load EOD reports."
    );
  }
};

/* -------------------------------------------------------
   SUPER ADMIN: REPORT DETAILS
------------------------------------------------------- */

exports.adminReportDetails = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await EODReport.findById(
      req.params.id
    ).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to load report details."
    );
  }
};

/* -------------------------------------------------------
   SUPER ADMIN: EMPLOYEE FILTER OPTIONS
------------------------------------------------------- */

exports.adminEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({
      status: {
        $nin: ["INACTIVE", "DELETED", "DISABLED"],
      },
    })
      .select(
        "_id firebaseUid name fullName firstName lastName employeeCode employeeId branch branchId branchName"
      )
      .sort({ name: 1, fullName: 1 })
      .lean();

    return res.json({
      success: true,
      data: employees.map((employee) => ({
        _id: employee._id,
        name: getName(employee),
        employeeCode:
          employee.employeeCode ||
          employee.employeeId ||
          "",
        branch: getBranch(employee),
      })),
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to load employees."
    );
  }
};

/* -------------------------------------------------------
   SUPER ADMIN: REPORT HISTORY
------------------------------------------------------- */

exports.adminReportHistory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID.",
      });
    }

    const report = await EODReport.findById(req.params.id)
      .select(
        "employeeName employeeCode reportDate history"
      )
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    return res.json({
      success: true,
      data: report.history || [],
    });
  } catch (error) {
    return responseError(
      res,
      error,
      "Unable to load report history."
    );
  }
};

/* -------------------------------------------------------
   EXPORT ALL ROUTE HANDLERS

   THESE TWO EXPORTS FIX YOUR CURRENT ERROR.
------------------------------------------------------- */

exports.authenticateStaff = authenticateStaff;
exports.requireManager = requireManager;
