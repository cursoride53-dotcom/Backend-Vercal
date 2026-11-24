

"use strict";

const admin = require("../config/firebase");
const Employee = require("../models/Employee");

const employeeAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    // Verify Firebase ID token and check revocation.
    const decodedToken = await admin
      .auth()
      .verifyIdToken(token, true);

    req.user = decodedToken;

    return next();
  } catch (error) {
    console.error(
      "EMPLOYEE AUTHENTICATION ERROR:",
      error.code || error.message
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session. Please log in again.",
    });
  }
};

// Load an active employee account from the database.
const requireEmployee = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Firebase user is missing",
      });
    }

    const employee = await Employee.findOne({
      firebaseUid: req.user.uid,
    }).select("-__v");

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: "Employee account not found",
      });
    }

    if (employee.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message:
          employee.status === "PROBATION"
            ? "Your account is under probation. Access is not enabled."
            : employee.status === "ON_HOLD"
              ? "Your account is on hold. Contact HR."
              : "Your employee account is inactive or deleted.",
      });
    }

    req.employee = employee;

    return next();
  } catch (error) {
    console.error(
      "EMPLOYEE AUTHORIZATION ERROR:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to verify employee account",
    });
  }
};

// Allow explicitly configured employee roles.
const requireEmployeeRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const employee = req.employee;

      if (!employee) {
        return res.status(401).json({
          success: false,
          message: "Employee authentication is required",
        });
      }

      const role = String(
        employee.systemRole || employee.role || ""
      )
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

      const permittedRoles = allowedRoles.map((item) =>
        String(item).trim().toUpperCase().replace(/[\s-]+/g, "_")
      );

      if (!permittedRoles.includes(role)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to access this resource",
        });
      }

      return next();
    } catch (error) {
      console.error("EMPLOYEE ROLE ERROR:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to verify employee permissions",
      });
    }
  };
};

// Permit active employees and Branch Managers on operational desk routes.

const requireOperationalAccess = (req, res, next) => {
  try {
    const employee = req.employee;

    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee authentication is required",
      });
    }

    const role = String(
      employee.systemRole || employee.role || employee.userType || ""
    )
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    const allowedRoles = ["EMPLOYEE", "BRANCH_MANAGER"];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied for role: ${role || "UNKNOWN"}`,
      });
    }

    return next();
  } catch (error) {
    console.error("OPERATIONAL ACCESS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify operational desk permissions",
    });
  }
};

module.exports = {
  employeeAuthMiddleware,
  requireEmployee,
  requireEmployeeRole,
  requireOperationalAccess,
};
