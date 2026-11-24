
"use strict";

const mongoose = require("mongoose");

const repaymentSchema = new mongoose.Schema(
  {
    payroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MonthlyPayroll",
      default: null,
    },
    payrollMonth: {
      type: String,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    deductedAt: {
      type: Date,
      default: Date.now,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "REQUESTED",
        "CREATED_BY_ADMIN",
        "APPROVED",
        "REJECTED",
        "DISBURSED",
        "REPAYMENT_RECORDED",
        "CANCELLED",
      ],
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    performedByRole: {
      type: String,
      enum: ["EMPLOYEE", "SUPER_ADMIN", "SYSTEM"],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const employeeAdvanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    employeeCode: {
      type: String,
      trim: true,
      default: "",
    },

    employeeName: {
      type: String,
      trim: true,
      required: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    requestedAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    approvedAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    disbursedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    reason: {
      type: String,
      trim: true,
      required: true,
      minlength: 5,
      maxlength: 2000,
    },

    repaymentMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
      default: 1,
    },

    monthlyInstallment: {
      type: Number,
      min: 0,
      default: 0,
    },

    repaymentStartMonth: {
      type: String,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "DISBURSED",
        "PARTIALLY_REPAID",
        "REPAID",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },

    source: {
      type: String,
      enum: ["EMPLOYEE_REQUEST", "SUPER_ADMIN"],
      default: "EMPLOYEE_REQUEST",
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    requestedAt: {
      type: Date,
      default: Date.now,
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

    disbursedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    disbursedAt: {
      type: Date,
      default: null,
    },

    paymentReference: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    totalRepaid: {
      type: Number,
      min: 0,
      default: 0,
    },

    repaymentHistory: {
      type: [repaymentSchema],
      default: [],
    },

    history: {
      type: [historySchema],
      default: [],
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
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

employeeAdvanceSchema.virtual("outstandingAmount").get(function () {
  return Math.max(
    0,
    Number(this.disbursedAmount || 0) -
      Number(this.totalRepaid || 0)
  );
});

employeeAdvanceSchema.index({ employee: 1, createdAt: -1 });
employeeAdvanceSchema.index({ status: 1, createdAt: -1 });
employeeAdvanceSchema.index({ employee: 1, status: 1 });

module.exports = mongoose.model(
  "EmployeeAdvance",
  employeeAdvanceSchema
);
