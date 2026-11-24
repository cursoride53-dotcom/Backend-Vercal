
"use strict";

const mongoose = require("mongoose");

const workTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required."],
      trim: true,
      maxlength: 200,
    },

    assigneeEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Assignee employee is required."],
      index: true,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch is required."],
      index: true,
    },

    branchName: {
      type: String,
      trim: true,
      default: "",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },

    dueDate: {
      type: Date,
      required: [true, "Due deadline is required."],
      index: true,
    },

    instructions: {
      type: String,
      required: [true, "Detailed instructions are required."],
      trim: true,
      maxlength: 10000,
    },

    expectedDeliverable: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },

    status: {
      type: String,
      enum: [
        "ASSIGNED",
        "IN_PROGRESS",
        "SUBMITTED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "ASSIGNED",
      index: true,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    completionNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

workTaskSchema.index({ branchId: 1, createdAt: -1 });

workTaskSchema.index({
  assigneeEmployeeId: 1,
  status: 1,
  dueDate: 1,
});

module.exports = mongoose.model("WorkTask", workTaskSchema);
