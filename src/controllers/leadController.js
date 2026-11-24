
"use strict";

const mongoose = require("mongoose");

const Lead = require("../models/Lead");
const Employee = require("../models/Employee");
const Branch = require("../models/Branch");

const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "MEETING_SET",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

const INACTIVE_STATUSES = [
  "INACTIVE",
  "DELETED",
  "DISABLED",
];

function getId(value) {
  if (!value) return "";

  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }

  return String(value);
}

function getName(employee) {
  return (
    employee.fullName ||
    employee.name ||
    employee.employeeName ||
    [employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ") ||
    employee.email ||
    employee.employeeCode ||
    "Employee"
  );
}

function normalizeBranchName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getEmployeeBranch(employee) {
  // In your Employee schema, branch is a STRING,
  // usually containing a name such as "Puna Branch".
  const branchValue = employee.branch ?? employee.branchId ?? "";

  if (branchValue && typeof branchValue === "object") {
    return {
      id: getId(branchValue),
      name:
        branchValue.branchName ||
        branchValue.name ||
        employee.branchName ||
        "",
    };
  }

  const rawValue = String(branchValue || "").trim();

  if (/^[a-f\d]{24}$/i.test(rawValue)) {
    return {
      id: rawValue,
      name: employee.branchName || "",
    };
  }

  return {
    id: "",
    name: employee.branchName || rawValue,
  };
}

function getBranchLabel(branch) {
  return (
    branch.branchName ||
    branch.name ||
    branch.branchCode ||
    branch.code ||
    "Unnamed branch"
  );
}

function getPagination(req) {
  const page = Math.max(
    1,
    Number.parseInt(req.query.page, 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function addHistory(lead, action, req, note = "") {
  const actor = req.superAdmin || req.employee || {};

  lead.history.push({
    action,
    note,
    performedBy: actor._id || null,
    performedByName: getName(actor),
    performedByRole: req.superAdmin ? "SUPER_ADMIN" : "EMPLOYEE",
  });
}

async function resolveBranch(branchValue) {
  if (!branchValue) {
    return {
      branch: null,
      branchName: "",
      document: null,
    };
  }

  let branchDoc = null;

  if (mongoose.isValidObjectId(String(branchValue))) {
    branchDoc = await Branch.findById(branchValue).lean();
  }

  if (!branchDoc) {
    const normalizedName = normalizeBranchName(branchValue);

    const allBranches = await Branch.find({
      status: { $nin: INACTIVE_STATUSES },
    })
      .select("_id branchName branchCode name status")
      .lean();

    branchDoc = allBranches.find(
      (item) =>
        normalizeBranchName(getBranchLabel(item)) === normalizedName ||
        normalizeBranchName(item.branchCode) === normalizedName
    );
  }

  if (!branchDoc) {
    const error = new Error("The selected branch was not found.");
    error.status = 400;
    throw error;
  }

  return {
    branch: branchDoc._id,
    branchName: getBranchLabel(branchDoc),
    document: branchDoc,
  };
}

async function resolveEmployee(employeeValue, branchInfo) {
  if (!employeeValue) {
    return {
      employee: null,
      employeeName: "",
    };
  }

  if (!mongoose.isValidObjectId(String(employeeValue))) {
    const error = new Error("Select a valid employee.");
    error.status = 400;
    throw error;
  }

  const employee = await Employee.findById(employeeValue).lean();

  if (!employee) {
    const error = new Error("The selected employee was not found.");
    error.status = 400;
    throw error;
  }

  if (
    INACTIVE_STATUSES.includes(
      String(employee.status || "ACTIVE").toUpperCase()
    )
  ) {
    const error = new Error("The selected employee is inactive.");
    error.status = 400;
    throw error;
  }

  const employeeBranch = getEmployeeBranch(employee);

  // Support employees whose branch field stores an ObjectId.
  const matchesById =
    employeeBranch.id &&
    branchInfo.branch &&
    String(employeeBranch.id) === String(branchInfo.branch);

  // Support your actual Employee schema, where branch is a name.
  const matchesByName =
    employeeBranch.name &&
    branchInfo.branchName &&
    normalizeBranchName(employeeBranch.name) ===
      normalizeBranchName(branchInfo.branchName);

  if (!matchesById && !matchesByName) {
    const error = new Error(
      `Employee "${getName(employee)}" does not belong to branch "${branchInfo.branchName}". Check the employee's saved branch.`
    );
    error.status = 400;
    throw error;
  }

  return {
    employee: employee._id,
    employeeName: getName(employee),
  };
}

/**
 * GET /api/leads/admin/options
 *
 * Returns active branches and employees.
 * Employee branch-name matching is supported.
 */
async function adminOptions(req, res) {
  try {
    const [branchDocs, employeeDocs] = await Promise.all([
      Branch.find({
        status: { $nin: INACTIVE_STATUSES },
      })
        .select("_id branchName branchCode name code status")
        .sort({ branchName: 1 })
        .lean(),

      Employee.find({
        status: { $nin: INACTIVE_STATUSES },
      })
        .select(
          "_id fullName name employeeName firstName lastName email employeeCode employeeId branch branchId branchName status"
        )
        .sort({ fullName: 1, name: 1 })
        .lean(),
    ]);

    const branches = branchDocs.map((branch) => ({
      _id: String(branch._id),
      name: getBranchLabel(branch),
      branchName: getBranchLabel(branch),
      code: branch.branchCode || branch.code || "",
    }));

    const employees = employeeDocs.map((employee) => {
      const branch = getEmployeeBranch(employee);

      return {
        _id: String(employee._id),
        name: getName(employee),
        employeeCode:
          employee.employeeCode || employee.employeeId || "",
        branchId: branch.id,
        branchName: branch.name,
        status: employee.status || "ACTIVE",
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        branches,
        employees,
      },
      statuses: LEAD_STATUSES,
    });
  } catch (error) {
    console.error("LEAD ADMIN OPTIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load branch and employee options.",
    });
  }
}

/**
 * GET /api/leads/admin/statuses
 */
async function statuses(req, res) {
  return res.json({
    success: true,
    data: LEAD_STATUSES,
  });
}

/**
 * GET /api/leads/admin
 */
async function adminList(req, res) {
  try {
    const { page, limit, skip } = getPagination(req);

    const query = { isDeleted: { $ne: true } };

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();

      if (!LEAD_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead status.",
        });
      }

      query.status = status;
    }

    if (req.query.branchId && mongoose.isValidObjectId(req.query.branchId)) {
      query.branch = req.query.branchId;
    }

    if (
      req.query.employeeId &&
      mongoose.isValidObjectId(req.query.employeeId)
    ) {
      query.assignedEmployee = req.query.employeeId;
    }

    if (req.query.from || req.query.to) {
      query.createdAt = {};

      if (req.query.from) {
        const from = new Date(req.query.from);
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date.",
          });
        }
        query.createdAt.$gte = from;
      }

      if (req.query.to) {
        const to = new Date(req.query.to);
        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid end date.",
          });
        }
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      query.$or = [
        { companyName: regex },
        { contactName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const [data, total] = await Promise.all([
      Lead.find(query)
        .populate("branch", "branchName branchCode")
        .populate("assignedEmployee", "fullName name employeeCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Lead.countDocuments(query),
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
    console.error("LEAD ADMIN LIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load leads.",
    });
  }
}

/**
 * POST /api/leads/admin
 */
async function adminCreate(req, res) {
  try {
    const body = req.body || {};

    const companyName = String(body.companyName || "").trim();
    const contactName = String(body.contactName || "").trim();

    if (!companyName || !contactName) {
      return res.status(400).json({
        success: false,
        message: "Company name and contact person are required.",
      });
    }

    const status = String(body.status || "NEW").toUpperCase();

    if (!LEAD_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead status.",
      });
    }

    let branchInfo = {
      branch: null,
      branchName: "",
    };

    if (body.branch || body.branchId) {
      branchInfo = await resolveBranch(body.branch || body.branchId);
    }

    const employeeInfo = await resolveEmployee(
      body.assignedEmployee || body.assignedEmployeeId || "",
      branchInfo
    );

    const expectedDeal =
      body.expectedDeal === "" ||
      body.expectedDeal === null ||
      body.expectedDeal === undefined
        ? 0
        : Number(body.expectedDeal);

    if (!Number.isFinite(expectedDeal) || expectedDeal < 0) {
      return res.status(400).json({
        success: false,
        message: "Expected deal amount must be a valid non-negative number.",
      });
    }

    const lead = new Lead({
      companyName,
      contactName,
      email: String(body.email || "").trim().toLowerCase(),
      phone: String(body.phone || "").trim(),
      requirement: String(body.requirement || "").trim(),
      expectedDeal,
      status,
      branch: branchInfo.branch,
      branchName: branchInfo.branchName,
      assignedEmployee: employeeInfo.employee,
      assignedEmployeeName: employeeInfo.employeeName,
      notes: String(body.notes || "").trim(),
      createdBy: req.superAdmin?._id || null,
      createdByName: getName(req.superAdmin || {}),
    });

    addHistory(lead, "LEAD_CREATED", req, "Lead created by Super Admin.");

    await lead.save();

    return res.status(201).json({
      success: true,
      message: "Lead created successfully.",
      data: lead,
    });
  } catch (error) {
    console.error("LEAD ADMIN CREATE ERROR:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "Unable to create lead.",
    });
  }
}

/**
 * GET /api/leads/admin/:id
 */
async function adminDetails(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID.",
      });
    }

    const lead = await Lead.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    })
      .populate("branch", "branchName branchCode")
      .populate("assignedEmployee", "fullName name employeeCode email")
      .lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    return res.json({ success: true, data: lead });
  } catch (error) {
    console.error("LEAD ADMIN DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load lead details.",
    });
  }
}

/**
 * PATCH /api/leads/admin/:id
 */
async function adminUpdate(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID.",
      });
    }

    const lead = await Lead.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    const body = req.body || {};

    if (body.companyName !== undefined) {
      const value = String(body.companyName).trim();
      if (!value) {
        return res.status(400).json({
          success: false,
          message: "Company name is required.",
        });
      }
      lead.companyName = value;
    }

    if (body.contactName !== undefined) {
      lead.contactName = String(body.contactName).trim();
    }

    if (body.email !== undefined) {
      lead.email = String(body.email).trim().toLowerCase();
    }

    if (body.phone !== undefined) {
      lead.phone = String(body.phone).trim();
    }

    if (body.requirement !== undefined) {
      lead.requirement = String(body.requirement).trim();
    }

    if (body.notes !== undefined) {
      lead.notes = String(body.notes).trim();
    }

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();

      if (!LEAD_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid lead status.",
        });
      }

      const previousStatus = lead.status;
      lead.status = status;

      if (previousStatus !== status) {
        addHistory(
          lead,
          "STATUS_CHANGED",
          req,
          `${previousStatus} → ${status}`
        );
      }
    }

    if (body.expectedDeal !== undefined) {
      const amount =
        body.expectedDeal === "" || body.expectedDeal === null
          ? 0
          : Number(body.expectedDeal);

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({
          success: false,
          message: "Expected deal amount must be non-negative.",
        });
      }

      lead.expectedDeal = amount;
    }

    const branchProvided =
      body.branch !== undefined || body.branchId !== undefined;

    const employeeProvided =
      body.assignedEmployee !== undefined ||
      body.assignedEmployeeId !== undefined;

    let branchInfo = {
      branch: lead.branch,
      branchName: lead.branchName || "",
    };

    if (branchProvided) {
      const value = body.branch ?? body.branchId;

      branchInfo = value
        ? await resolveBranch(value)
        : { branch: null, branchName: "" };

      lead.branch = branchInfo.branch;
      lead.branchName = branchInfo.branchName;
    }

    if (employeeProvided || branchProvided) {
      const employeeValue = employeeProvided
        ? body.assignedEmployee ?? body.assignedEmployeeId
        : lead.assignedEmployee;

      const employeeInfo = await resolveEmployee(
        employeeValue || "",
        branchInfo
      );

      lead.assignedEmployee = employeeInfo.employee;
      lead.assignedEmployeeName = employeeInfo.employeeName;

      addHistory(
        lead,
        "ASSIGNMENT_UPDATED",
        req,
        `Branch: ${lead.branchName || "Unassigned"}; Employee: ${
          lead.assignedEmployeeName || "Unassigned"
        }`
      );
    }

    await lead.save();

    return res.json({
      success: true,
      message: "Lead updated successfully.",
      data: lead,
    });
  } catch (error) {
    console.error("LEAD ADMIN UPDATE ERROR:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "Unable to update lead.",
    });
  }
}

/**
 * DELETE /api/leads/admin/:id
 * Soft-delete lead.
 */
async function adminDelete(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID.",
      });
    }

    const lead = await Lead.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    lead.isDeleted = true;
    addHistory(lead, "LEAD_DELETED", req, "Lead soft-deleted.");
    await lead.save();

    return res.json({
      success: true,
      message: "Lead deleted successfully.",
    });
  } catch (error) {
    console.error("LEAD ADMIN DELETE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete lead.",
    });
  }
}

/**
 * GET /api/leads/admin/:id/history
 */
async function adminHistory(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID.",
      });
    }

    const lead = await Lead.findById(req.params.id)
      .select("companyName history")
      .lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    return res.json({
      success: true,
      data: lead.history || [],
    });
  } catch (error) {
    console.error("LEAD ADMIN HISTORY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load lead history.",
    });
  }
}

// Employee endpoints require their own access-control checks.
// Keep these handlers only if they match the authorization policy
// and request fields already used by your employee portal.
async function createMyLead(req, res) {
  return res.status(501).json({
    success: false,
    message:
      "Employee lead creation must be configured for your employee access policy.",
  });
}

async function myLeads(req, res) {
  return res.status(501).json({
    success: false,
    message:
      "Employee lead listing must be configured for your employee access policy.",
  });
}

async function getMyLead(req, res) {
  return res.status(501).json({
    success: false,
    message:
      "Employee lead details must be configured for your employee access policy.",
  });
}

async function updateMyLead(req, res) {
  return res.status(501).json({
    success: false,
    message:
      "Employee lead updates must be configured for your employee access policy.",
  });
}

module.exports = {
  createMyLead,
  myLeads,
  getMyLead,
  updateMyLead,
  adminList,
  adminCreate,
  adminDetails,
  adminUpdate,
  adminDelete,
  adminOptions,
  adminHistory,
  statuses,
  LEAD_STATUSES,
};