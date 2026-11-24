

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const auditFields = {
  createdBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
};

/* =========================================
   1. TELECALLING DESK
========================================= */

const callSchema = new Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 254,
    },
    callerRep: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    callType: {
      type: String,
      enum: ["INBOUND", "OUTBOUND"],
      default: "OUTBOUND",
    },
    disposition: {
      type: String,
      enum: [
        "CONNECTED",
        "NO_ANSWER",
        "BUSY",
        "CALLBACK_REQUESTED",
        "FOLLOW_UP_REQUIRED",
        "RESOLVED",
        "ESCALATED",
        "OTHER",
      ],
      default: "OTHER",
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },
    discussionNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    ...auditFields,
  },
  { timestamps: true, versionKey: false }
);

callSchema.index({ createdAt: -1 });
callSchema.index({ followUpDate: 1 });
callSchema.index({ customerPhone: 1 });

/* =========================================
   2. SUPPORT TICKETS
========================================= */

const supportTicketSchema = new Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    customerPhone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: "",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },
    assignedAgent: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "OPEN",
        "IN_PROGRESS",
        "ON_HOLD",
        "RESOLVED",
        "CLOSED",
      ],
      default: "OPEN",
    },
    slaDueAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    ...auditFields,
  },
  { timestamps: true, versionKey: false }
);

supportTicketSchema.index({ status: 1, priority: 1 });
supportTicketSchema.index({ createdAt: -1 });

/* =========================================
   3. INSTALLATION OPERATIONS
========================================= */

const installationJobSchema = new Schema(
  {
    jobId: {
      type: String,
      unique: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    customerPhone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
    siteName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    siteAddress: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    assignedTechnician: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    scheduledDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "SCHEDULED",
        "ASSIGNED",
        "AT_SITE",
        "IN_PROGRESS",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "SCHEDULED",
    },
    siteGps: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
        default: null,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
        default: null,
      },
    },
    materialsConsumed: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: 150,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0,
        },
        unit: {
          type: String,
          trim: true,
          default: "PCS",
          maxlength: 30,
        },
      },
    ],
    signOffNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    signedOffAt: {
      type: Date,
      default: null,
    },
    signedOffBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    ...auditFields,
  },
  { timestamps: true, versionKey: false }
);

installationJobSchema.index({ status: 1, scheduledDate: 1 });
installationJobSchema.index({ assignedTechnician: 1 });

/* =========================================
   4. TRANSPORT FLEET
========================================= */

const transportVehicleSchema = new Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    vehicleType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    registrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 30,
      default: "",
    },
    driverName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    driverPhone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
    operationMode: {
      type: String,
      enum: ["DELIVERY", "PICKUP"],
      default: "DELIVERY",
    },
    assignedRoute: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "ASSIGNED",
        "IN_TRANSIT",
        "COMPLETED",
        "MAINTENANCE",
        "INACTIVE",
      ],
      default: "AVAILABLE",
    },
    currentGps: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
        default: null,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
        default: null,
      },
      recordedAt: {
        type: Date,
        default: null,
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    ...auditFields,
  },
  { timestamps: true, versionKey: false }
);

transportVehicleSchema.index({ status: 1 });
transportVehicleSchema.index({ driverName: 1 });

/* =========================================
   5. OPERATIONAL AUDIT HISTORY
========================================= */

const operationalHistorySchema = new Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: [
        "CALL",
        "SUPPORT_TICKET",
        "INSTALLATION_JOB",
        "TRANSPORT_VEHICLE",
      ],
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "CREATED",
        "UPDATED",
        "STATUS_CHANGED",
        "ASSIGNED",
        "RESOLVED",
        "SIGNED_OFF",
        "DELETED",
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    changes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    performedByName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },
    performedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

operationalHistorySchema.index({
  entityType: 1,
  entityId: 1,
  performedAt: -1,
});

/* =========================================
   EXPORT ALL MODELS
========================================= */

module.exports = {
  OperationalCall: mongoose.model(
    "OperationalCall",
    callSchema
  ),
  SupportTicket: mongoose.model(
    "SupportTicket",
    supportTicketSchema
  ),
  InstallationJob: mongoose.model(
    "InstallationJob",
    installationJobSchema
  ),
  TransportVehicle: mongoose.model(
    "TransportVehicle",
    transportVehicleSchema
  ),
  OperationalHistory: mongoose.model(
    "OperationalHistory",
    operationalHistorySchema
  ),
};
