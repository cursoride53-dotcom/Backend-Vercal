
"use strict";

const mongoose = require("mongoose");

const monthlyPayrollSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    employeeSalary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeSalary",
      required: true,
    },

    employeeCode: {
      type: String,
      trim: true,
      default: "",
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
    },

    // Payroll month, for example 2026-10
    payrollMonth: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },

    periodStart: {
      type: Date,
      required: true,
    },

    periodEnd: {
      type: Date,
      required: true,
    },

    // Salary snapshot at the time payroll is generated
    basicSalary: {
      type: Number,
      required: true,
      min: 0,
    },

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

    grossSalary: {
      type: Number,
      required: true,
      min: 0,
    },

    // Attendance summary
    totalCalendarDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalWorkingDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    presentDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    halfDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    absentDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    weeklyOffDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    holidayDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidLeaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    unpaidLeaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    payableDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    salaryDivisor: {
      type: Number,
      required: true,
      min: 1,
    },

    dailySalary: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Salary calculation
    attendanceEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },

    attendanceDeduction: {
      type: Number,
      default: 0,
      min: 0,
    },

    unpaidLeaveDeduction: {
      type: Number,
      default: 0,
      min: 0,
    },

    absenceDeduction: {
      type: Number,
      default: 0,
      min: 0,
    },

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

    totalDeductions: {
      type: Number,
      default: 0,
      min: 0,
    },

    netSalary: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      enum: ["INR"],
    },

    calculationNotes: {
      type: String,
      trim: true,
      default: "",
    },

    // Workflow controlled by Super Admin
    status: {
      type: String,
      enum: [
        "DRAFT",
        "CALCULATED",
        "APPROVED",
        "PAID",
        "CANCELLED",
      ],
      default: "DRAFT",
      index: true,
    },

    calculatedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    paymentReference: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
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

// One payroll record per employee per month.
monthlyPayrollSchema.index(
  { employee: 1, payrollMonth: 1 },
  { unique: true }
);

monthlyPayrollSchema.index({
  payrollMonth: 1,
  status: 1,
});

monthlyPayrollSchema.index({
  branch: 1,
  payrollMonth: 1,
});

module.exports = mongoose.model(
  "MonthlyPayroll",
  monthlyPayrollSchema
);
