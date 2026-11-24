
"use strict";

const mongoose = require("mongoose");

const employeeSalarySchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
      index: true,
    },

    employeeCode: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    employeeName: {
      type: String,
      trim: true,
      default: "",
    },

    branch: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    // Salary set by Super Admin
    basicSalary: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Monthly allowances
    hra: {
      type: Number,
      default: 0,
      min: 0,
    },

    conveyanceAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },

    otherAllowances: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Fixed monthly deductions
    professionalTax: {
      type: Number,
      default: 0,
      min: 0,
    },

    providentFund: {
      type: Number,
      default: 0,
      min: 0,
    },

    otherDeductions: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Attendance-based salary calculation policy
    salaryCalculationMethod: {
      type: String,
      enum: ["CALENDAR_DAYS", "FIXED_30", "WORKING_DAYS"],
      default: "WORKING_DAYS",
      required: true,
    },

    // Used when salaryCalculationMethod is WORKING_DAYS
    standardWorkingDays: {
      type: Number,
      default: 26,
      min: 1,
      max: 31,
    },

    // Whether approved paid leave counts as paid attendance
    paidLeaveEnabled: {
      type: Boolean,
      default: true,
    },

    // Whether an approved unpaid leave reduces payable days
    deductUnpaidLeave: {
      type: Boolean,
      default: true,
    },

    // Whether absent days without approved leave reduce salary
    deductUnapprovedAbsence: {
      type: Boolean,
      default: true,
    },

    // Half-day attendance counts as half a payable day
    halfDayFactor: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
    },

    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },

    effectiveTo: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
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

employeeSalarySchema.virtual("monthlyGrossSalary").get(function () {
  return (
    Number(this.basicSalary || 0) +
    Number(this.hra || 0) +
    Number(this.conveyanceAllowance || 0) +
    Number(this.otherAllowances || 0)
  );
});

employeeSalarySchema.set("toJSON", { virtuals: true });
employeeSalarySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model(
  "EmployeeSalary",
  employeeSalarySchema
);
