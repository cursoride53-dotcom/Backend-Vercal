
"use strict";

const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    employeeCode: {
      type: String,
      required: true,
      trim: true,
    },

    employeeName: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      required: true,
      trim: true,
    },

    attendanceDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },

    checkInAt: {
      type: Date,
      required: true,
    },

    checkInSelfiePath: {
      type: String,
      required: true,
      select: false,
    },

    checkInLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      accuracyMeters: { type: Number, min: 0 },
    },

    checkOutAt: {
      type: Date,
      default: null,
    },

    checkOutSelfiePath: {
      type: String,
      default: null,
      select: false,
    },

    checkOutLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      accuracyMeters: { type: Number, min: 0 },
    },

    workedMinutes: {
      type: Number,
      default: null,
      min: 0,
    },

    status: {
      type: String,
      enum: ["PRESENT", "HALF_DAY", "ABSENT"],
      default: "PRESENT",
    },

    reviewStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNote: {
      type: String,
      default: "",
      maxlength: 1000,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// One attendance record per employee per local calendar day.
attendanceSchema.index(
  { employee: 1, attendanceDate: 1 },
  { unique: true }
);

attendanceSchema.index({
  attendanceDate: -1,
  branch: 1,
});

module.exports = mongoose.model("Attendance", attendanceSchema);
