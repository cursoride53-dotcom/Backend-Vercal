
"use strict";

const admin = require("../config/firebase");
const Employee = require("../models/Employee");

async function attendanceAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Firebase ID token is missing",
      });
    }

    // Verify the Firebase session and check token revocation.
    const decodedToken = await admin.auth().verifyIdToken(token, true);

    // Find the employee created through your registration system.
    const employee = await Employee.findOne({
      firebaseUid: decodedToken.uid,
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: "Employee is not registered in HRMSZermii",
      });
    }

    if (
      String(employee.status || "").toUpperCase() !== "ACTIVE"
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee account is inactive",
      });
    }

    // Store the verified database record for attendance controllers.
    req.employee = employee;
    req.firebaseUser = decodedToken;

    return next();
  } catch (error) {
    console.error(
      "ATTENDANCE AUTH ERROR:",
      error.code || error.message
    );

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
}

module.exports = attendanceAuth;
