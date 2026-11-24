

"use strict";

const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    branchName: {
      type: String,
      required: [true, "Branch name is required."],
      trim: true,
      maxlength: 150,
    },

    branchCode: {
      type: String,
      required: [true, "Branch code is required."],
      trim: true,
      uppercase: true,
      maxlength: 30,
    },

    address: {
      type: String,
      required: [true, "Full street address is required."],
      trim: true,
      maxlength: 500,
    },

    city: {
      type: String,
      required: [true, "City is required."],
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      required: [true, "State is required."],
      trim: true,
      maxlength: 100,
    },

    pincode: {
      type: String,
      required: [true, "Pincode is required."],
      trim: true,
      match: [/^\d{6}$/, "Enter a valid 6-digit Indian pincode."],
    },

    // Optional branch manager. Assign after employees are created.
    branchManagerName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    branchManagerEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    // Optional HR employee assignment.
    hrEmployeeName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    hrEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    branchContactPhone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 20,
    },

    // GPS and geofencing settings.
    geofence: {
      latitude: {
        type: Number,
        default: null,
        min: -90,
        max: 90,
      },

      longitude: {
        type: Number,
        default: null,
        min: -180,
        max: 180,
      },

      radiusMeters: {
        type: Number,
        default: 300,
        min: 1,
        max: 100000,
      },
    },

    // Branch working schedule.
    workingHours: {
      startTime: {
        type: String,
        default: "09:00",
        match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."],
      },

      endTime: {
        type: String,
        default: "18:00",
        match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."],
      },

      breakStartTime: {
        type: String,
        default: "13:00",
        match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."],
      },

      breakEndTime: {
        type: String,
        default: "14:00",
        match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format."],
      },

      workingDays: {
        type: [
          {
            type: String,
            enum: [
              "MONDAY",
              "TUESDAY",
              "WEDNESDAY",
              "THURSDAY",
              "FRIDAY",
              "SATURDAY",
              "SUNDAY",
            ],
          },
        ],
        default: [
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ],
      },
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Branch codes must be unique.
branchSchema.index({ branchCode: 1 }, { unique: true });

// Branch names must be unique within a city.
branchSchema.index({ branchName: 1, city: 1 }, { unique: true });

module.exports = mongoose.model("Branch", branchSchema);
