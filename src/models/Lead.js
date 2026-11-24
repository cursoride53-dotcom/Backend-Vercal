
"use strict";

const mongoose = require("mongoose");

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

const leadHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    fromStatus: {
      type: String,
      default: "",
    },
    toStatus: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    performedByName: {
      type: String,
      default: "",
    },
    performedByRole: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const leadSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    contactName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 254,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },

    requirement: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },

    expectedDeal: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "NEW",
      index: true,
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    branchName: {
      type: String,
      trim: true,
      default: "",
    },

    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },

    assignedEmployeeName: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    createdByName: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
      maxlength: 5000,
    },

    history: {
      type: [leadHistorySchema],
      default: [],
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Useful indexes for branch and employee dashboards.
leadSchema.index({
  branch: 1,
  assignedEmployee: 1,
  status: 1,
  createdAt: -1,
});

leadSchema.index({
  companyName: "text",
  contactName: "text",
  email: "text",
  phone: "text",
});

const Lead = mongoose.model("Lead", leadSchema);

module.exports = Lead;
module.exports.LEAD_STATUSES = LEAD_STATUSES;
