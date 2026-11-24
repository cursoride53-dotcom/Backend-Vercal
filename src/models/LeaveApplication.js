"use strict";

const mongoose = require("mongoose");

const leaveApplicationSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    employeeCode: { type: String, trim: true, default: "" },
    employeeName: { type: String, trim: true, required: true },
    employeeEmail: { type: String, trim: true, lowercase: true, default: "" },
    branch: { type: String, trim: true, default: "" },

    leaveType: {
      type: String,
      enum: [
        "CASUAL",
        "SICK",
        "EARNED",
        "UNPAID",
        "MATERNITY",
        "PATERNITY",
        "COMPENSATORY",
        "OTHER",
      ],
      required: true,
    },

    startDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    endDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    totalDays: { type: Number, required: true, min: 1 },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    contactDuringLeave: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },

    // EMPLOYEE or SUPER_ADMIN
    appliedByRole: {
      type: String,
      enum: ["EMPLOYEE", "SUPER_ADMIN"],
      default: "EMPLOYEE",
      required: true,
    },

    // The Super Admin who created this application, if applicable.
    createdBySuperAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    appliedAt: { type: Date, default: Date.now },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    reviewedAt: { type: Date, default: null },

    reviewNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

leaveApplicationSchema.index({
  employee: 1,
  startDate: 1,
  endDate: 1,
});

leaveApplicationSchema.index({
  status: 1,
  appliedAt: -1,
});

module.exports =
  mongoose.models.LeaveApplication ||
  mongoose.model("LeaveApplication", leaveApplicationSchema);