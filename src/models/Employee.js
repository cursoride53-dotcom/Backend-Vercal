
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    // ACCOUNT USER ID & LOGIN CREDENTIALS
    employeeCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
    },

    // SYSTEM ROLE
    systemRole: {
      type: String,
      enum: ["EMPLOYEE", "BRANCH_MANAGER", "HR_ADMIN"],
      default: "EMPLOYEE",
      required: true,
    },

    // BRANCH PLACEMENT
    branch: {
      type: String,
      required: [true, "Assigned branch is required"],
      trim: true,
    },

    // DEPARTMENT
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
    },

    // OPERATIONAL TEAM
    operationalTeam: {
      type: String,
      required: [true, "Operational team is required"],
      trim: true,
    },

    // DESIGNATION
    designationTitle: {
      type: String,
      required: [true, "Designation title is required"],
      trim: true,
    },

    // REPORTING MANAGER
    reportingManager: {
      type: String,
      default: "",
      trim: true,
    },

    // INITIAL EMPLOYEE STATUS
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "PROBATION",
        "ON_HOLD",
        "INACTIVE",
        "DELETED",
      ],
      default: "ACTIVE",
      required: true,
    },

    // MONTHLY COMPENSATION & DEDUCTIONS (INR)
    salary: {
      basicPay: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      hra: {
        type: Number,
        min: 0,
        default: 0,
      },

      conveyance: {
        type: Number,
        min: 0,
        default: 0,
      },

      tdsDeduction: {
        type: Number,
        min: 0,
        default: 0,
      },
    },

    // FIREBASE LOGIN ACCOUNT
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },

    // SUPER ADMIN WHO CREATED THIS EMPLOYEE
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Search employee records
employeeSchema.index({
  fullName: "text",
  email: "text",
  employeeCode: "text",
});

module.exports = mongoose.model("Employee", employeeSchema);
