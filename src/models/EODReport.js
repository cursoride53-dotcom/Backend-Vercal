"use strict";

const mongoose = require("mongoose");

const reviewHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        "SUBMITTED",
        "UPDATED",
        "APPROVED",
        "REJECTED",
        "CHANGES_REQUESTED",
      ],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    performedByRole: {
      type: String,
      enum: ["EMPLOYEE", "MANAGER", "SUPER_ADMIN"],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const eodReportSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    employeeUid: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    employeeName: {
      type: String,
      trim: true,
      required: true,
    },

    employeeCode: {
      type: String,
      trim: true,
      default: "",
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    branchName: {
      type: String,
      trim: true,
      default: "",
    },

    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },

    reportDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    callsLogged: {
      type: Number,
      min: 0,
      max: 10000,
      default: 0,
    },

    clientVisits: {
      type: Number,
      min: 0,
      max: 10000,
      default: 0,
    },

    workCompleted: {
      type: String,
      trim: true,
      required: true,
      maxlength: 10000,
    },

    tasksPending: {
      type: String,
      trim: true,
      default: "",
      maxlength: 10000,
    },

    impediments: {
      type: String,
      trim: true,
      default: "",
      maxlength: 10000,
    },

    tomorrowPlan: {
      type: String,
      trim: true,
      required: true,
      maxlength: 10000,
    },

    additionalNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 10000,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "APPROVED",
        "REJECTED",
        "CHANGES_REQUESTED",
      ],
      default: "SUBMITTED",
      index: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    reviewedByName: {
      type: String,
      trim: true,
      default: "",
    },

    reviewNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    history: {
      type: [reviewHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// One report per employee per date.
eodReportSchema.index(
  { employee: 1, reportDate: 1 },
  { unique: true }
);

eodReportSchema.index({ status: 1, reportDate: -1 });
eodReportSchema.index({ manager: 1, status: 1, reportDate: -1 });
eodReportSchema.index({ branch: 1, reportDate: -1 });

module.exports = mongoose.model("EODReport", eodReportSchema);