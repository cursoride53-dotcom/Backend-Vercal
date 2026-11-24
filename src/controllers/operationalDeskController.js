

"use strict";

const mongoose = require("mongoose");

const {
  OperationalCall,
  SupportTicket,
  InstallationJob,
  TransportVehicle,
  OperationalHistory,
} = require("../models/OperationalDesk");

const CONFIG = {
  calls: {
    model: OperationalCall,
    entityType: "CALL",
  },
  tickets: {
    model: SupportTicket,
    entityType: "SUPPORT_TICKET",
  },
  installations: {
    model: InstallationJob,
    entityType: "INSTALLATION_JOB",
  },
  vehicles: {
    model: TransportVehicle,
    entityType: "TRANSPORT_VEHICLE",
  },
};

const EMPLOYEE_CREATE_FIELDS = {
  calls: [
    "customerName",
    "customerPhone",
    "customerEmail",
    "callerRep",
    "callType",
    "disposition",
    "durationSeconds",
    "discussionNotes",
    "followUpDate",
  ],
  tickets: [
    "customerName",
    "customerPhone",
    "subject",
    "description",
    "priority",
  ],
  installations: [],
  vehicles: [],
};

const EMPLOYEE_UPDATE_FIELDS = {
  calls: [
    "disposition",
    "durationSeconds",
    "discussionNotes",
    "followUpDate",
  ],
  tickets: [
    "description",
  ],
  installations: [
    "status",
    "siteGps",
    "materialsConsumed",
    "signOffNotes",
  ],
  vehicles: [
    "currentGps",
    "status",
    "notes",
  ],
};



function getActor(req) {
  const user =
    req.superAdmin ||
    req.employee ||
    req.admin ||
    req.user ||
    {};

  const rawId =
    user._id ||
    user.id ||
    user.employeeId ||
    user.userId ||
    null;

  return {
    id: rawId ? String(rawId) : null,
    name:
      user.fullName ||
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "",
    role: String(
      user.systemRole || user.role || user.userType || ""
    )
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_"),
  };
}

function isSuperAdmin(req) {
  if (!req.superAdmin) return false;

  const actor = getActor(req);

  return (
    ["SUPER_ADMIN", "SUPERADMIN"].includes(actor.role) &&
    req.superAdmin.status === "ACTIVE"
  );
}

function isOperationalUser(req) {
  if (!req.employee) return false;

  const actor = getActor(req);

  return ["EMPLOYEE", "BRANCH_MANAGER"].includes(actor.role);
}


function isSuperAdmin(req) {
  const actor = getActor(req);

  return Boolean(
    req.superAdmin &&
    actor.role === "SUPER_ADMIN"
  );
}

function isOperationalUser(req) {
  const actor = getActor(req);

  return Boolean(
    req.employee &&
    ["EMPLOYEE", "BRANCH_MANAGER"].includes(actor.role)
  );
}

  
  function isSuperAdmin(req) {
    const user = req.superAdmin;
  
    return Boolean(
      user &&
      user._id &&
      user.role === "SUPER_ADMIN" &&
      user.status === "ACTIVE"
    );
  }
  
  function isOperationalUser(req) {
    const actor = getActor(req);
  
    return ["EMPLOYEE", "BRANCH_MANAGER"].includes(actor.role);
  }
  
function isSuperAdmin(req) {
  const actor = getActor(req);

  return [
    "SUPER_ADMIN",
    "SUPERADMIN",
  ].includes(actor.role);
}

function isEmployee(req) {
  const actor = getActor(req);

  return actor.role === "EMPLOYEE";
}

function safePayload(body, allowedFields) {
  const payload = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  }

  return payload;
}

function getConfig(resource) {
  return CONFIG[resource] || null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pagination(query) {
  const page = Math.max(
    1,
    Number.parseInt(query.page, 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 20)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function employeeRecordFilter(resource, actor) {
  if (resource === "installations") {
    return { assignedTechnician: actor.id };
  }

  if (resource === "tickets") {
    return { assignedAgent: actor.id };
  }

  return { createdBy: actor.id };
}

async function writeHistory({
  config,
  record,
  action,
  description,
  changes = {},
  actor,
}) {
  await OperationalHistory.create({
    entityType: config.entityType,
    entityId: record._id,
    action,
    description,
    changes,
    performedBy: actor.id,
    performedByName: actor.name,
  });
}

function sendError(res, error) {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: Object.values(error.errors).map(
        (item) => item.message
      ),
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this identifier already exists",
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid field value",
    });
  }

  console.error("OPERATIONAL DESK ERROR:", error.message);

  return res.status(500).json({
    success: false,
    message: "An internal server error occurred",
  });
}

/* =========================================
   DASHBOARD
========================================= */

exports.getDashboard = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Super Admin access required",
      });
    }

    const counts = await Promise.all(
      Object.entries(CONFIG).map(async ([key, config]) => [
        key,
        await config.model.countDocuments({
          deletedAt: null,
        }),
      ])
    );

    return res.json({
      success: true,
      data: Object.fromEntries(counts),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   LIST RECORDS
========================================= */

exports.listRecords = async (req, res) => {
  try {
    const { resource } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    const actor = getActor(req);

    if (!actor.id) {
      return res.status(403).json({
        success: false,
        message: "Database user identity is missing",
      });
    }

    const filter = { deletedAt: null };

    if (!isSuperAdmin(req)) {
      if (!isOperationalUser(req)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      Object.assign(
        filter,
        employeeRecordFilter(resource, actor)
      );
    }

    if (req.query.status && resource !== "calls") {
      filter.status = String(req.query.status);
    }

    if (req.query.priority && resource === "tickets") {
      filter.priority = String(req.query.priority);
    }

    if (req.query.disposition && resource === "calls") {
      filter.disposition = String(req.query.disposition);
    }

    if (req.query.search) {
      const search = String(req.query.search)
        .trim()
        .slice(0, 100);

      if (search) {
        const fields = {
          calls: ["customerName", "customerPhone", "callerRep"],
          tickets: ["ticketId", "customerName", "subject"],
          installations: ["jobId", "customerName", "siteName"],
          vehicles: ["vehicleId", "driverName", "registrationNumber"],
        }[resource];

        filter.$or = fields.map((field) => ({
          [field]: {
            $regex: escapeRegex(search),
            $options: "i",
          },
        }));
      }
    }

    const { page, limit, skip } = pagination(req.query);

    const [data, total] = await Promise.all([
      config.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      config.model.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   GET SINGLE RECORD
========================================= */

exports.getRecord = async (req, res) => {
  try {
    const { resource, id } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
      });
    }

    const actor = getActor(req);
    const filter = {
      _id: id,
      deletedAt: null,
    };

    if (!isSuperAdmin(req)) {
      if (!isOperationalUser(req) || !actor.id) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      Object.assign(
        filter,
        employeeRecordFilter(resource, actor)
      );
    }

    const record = await config.model.findOne(filter).lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found or access denied",
      });
    }

    const history = await OperationalHistory.find({
      entityType: config.entityType,
      entityId: record._id,
    })
      .sort({ performedAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      data: record,
      history,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   CREATE RECORD
========================================= */

exports.createRecord = async (req, res) => {
  try {
    const { resource } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    const actor = getActor(req);

    if (!actor.id) {
      return res.status(403).json({
        success: false,
        message: "Database user identity is missing",
      });
    }

    if (!isSuperAdmin(req) && !isOperationalUser(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const allowedFields = isSuperAdmin(req)
      ? [
          ...EMPLOYEE_CREATE_FIELDS[resource],
          "ticketId",
          "jobId",
          "siteName",
          "siteAddress",
          "assignedAgent",
          "assignedTechnician",
          "scheduledDate",
          "slaDueAt",
          "vehicleId",
          "vehicleType",
          "registrationNumber",
          "driverName",
          "driverPhone",
          "operationMode",
          "assignedRoute",
          "status",
        ]
      : EMPLOYEE_CREATE_FIELDS[resource];

    const payload = safePayload(
      req.body || {},
      allowedFields
    );

    if (resource === "tickets" && !payload.ticketId) {
      payload.ticketId =
        `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    if (resource === "installations" && !payload.jobId) {
      payload.jobId = `JOB-${Date.now()}`;
    }

    if (resource === "vehicles" && !payload.vehicleId) {
      return res.status(400).json({
        success: false,
        message: "Vehicle ID is required",
      });
    }

    const record = await config.model.create({
      ...payload,
      createdBy: actor.id,
      updatedBy: actor.id,
    });

    await writeHistory({
      config,
      record,
      action: "CREATED",
      description: `${resource} record created`,
      changes: payload,
      actor,
    });

    return res.status(201).json({
      success: true,
      message: "Record created successfully",
      data: record,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   UPDATE RECORD
========================================= */

exports.updateRecord = async (req, res) => {
  try {
    const { resource, id } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
      });
    }

    const actor = getActor(req);

    if (!actor.id) {
      return res.status(403).json({
        success: false,
        message: "Database user identity is missing",
      });
    }

    const filter = {
      _id: id,
      deletedAt: null,
    };

    if (!isSuperAdmin(req)) {
      if (!isOperationalUser(req)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      Object.assign(
        filter,
        employeeRecordFilter(resource, actor)
      );
    }

    const record = await config.model.findOne(filter);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found or access denied",
      });
    }

    const fields = isSuperAdmin(req)
      ? [
          ...EMPLOYEE_UPDATE_FIELDS[resource],
          ...EMPLOYEE_CREATE_FIELDS[resource],
          "ticketId",
          "jobId",
          "siteName",
          "siteAddress",
          "assignedAgent",
          "assignedTechnician",
          "scheduledDate",
          "slaDueAt",
          "resolutionNotes",
          "vehicleId",
          "vehicleType",
          "registrationNumber",
          "driverName",
          "driverPhone",
          "operationMode",
          "assignedRoute",
        ]
      : EMPLOYEE_UPDATE_FIELDS[resource];

    const payload = safePayload(req.body || {}, fields);
    const previousStatus = record.status;

    for (const [field, value] of Object.entries(payload)) {
      record.set(field, value);
    }

    record.updatedBy = actor.id;

    if (
      resource === "tickets" &&
      payload.status === "RESOLVED" &&
      previousStatus !== "RESOLVED"
    ) {
      record.resolvedAt = new Date();
    }

    await record.save();

    const statusChanged =
      Object.prototype.hasOwnProperty.call(payload, "status") &&
      previousStatus !== payload.status;

    await writeHistory({
      config,
      record,
      action: statusChanged ? "STATUS_CHANGED" : "UPDATED",
      description: statusChanged
        ? `Status changed from ${previousStatus} to ${payload.status}`
        : `${resource} record updated`,
      changes: payload,
      actor,
    });

    return res.json({
      success: true,
      message: "Record updated successfully",
      data: record,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   DELETE RECORD — SUPER ADMIN ONLY
========================================= */

exports.deleteRecord = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can delete records",
      });
    }

    const { resource, id } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
      });
    }

    const actor = getActor(req);

    const record = await config.model.findOne({
      _id: id,
      deletedAt: null,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    record.deletedAt = new Date();
    record.updatedBy = actor.id;

    await record.save();

    await writeHistory({
      config,
      record,
      action: "DELETED",
      description: `${resource} record deleted`,
      actor,
    });

    return res.json({
      success: true,
      message: "Record deleted successfully",
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   INSTALLATION SIGN-OFF
========================================= */

exports.signOffInstallation = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can sign off installations",
      });
    }

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid installation ID",
      });
    }

    const actor = getActor(req);

    const job = await InstallationJob.findOne({
      _id: id,
      deletedAt: null,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Installation job not found",
      });
    }

    if (["COMPLETED", "CANCELLED"].includes(job.status)) {
      return res.status(409).json({
        success: false,
        message: "This job cannot be signed off",
      });
    }

    job.status = "COMPLETED";
    job.signOffNotes = String(
      req.body?.signOffNotes || ""
    ).trim();
    job.signedOffAt = new Date();
    job.signedOffBy = actor.id;
    job.updatedBy = actor.id;

    await job.save();

    await writeHistory({
      config: CONFIG.installations,
      record: job,
      action: "SIGNED_OFF",
      description: "Installation signed off by Super Admin",
      changes: {
        status: "COMPLETED",
        signOffNotes: job.signOffNotes,
      },
      actor,
    });

    return res.json({
      success: true,
      message: "Installation signed off successfully",
      data: job,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* =========================================
   AUDIT HISTORY
========================================= */

exports.getRecordHistory = async (req, res) => {
  try {
    const { resource, id } = req.params;
    const config = getConfig(resource);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Unknown operational resource",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID",
      });
    }

    const filter = { _id: id };

    if (!isSuperAdmin(req)) {
      const actor = getActor(req);

      if (!isOperationalUser(req) || !actor.id) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      Object.assign(
        filter,
        employeeRecordFilter(resource, actor)
      );
    }

    const record = await config.model.findOne(filter).select("_id");

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found or access denied",
      });
    }

    const history = await OperationalHistory.find({
      entityType: config.entityType,
      entityId: id,
    })
      .sort({ performedAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
