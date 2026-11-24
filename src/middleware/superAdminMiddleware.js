
"use strict";

const admin = require("../config/firebase");
const SuperAdmin = require("../models/SuperAdmin");

// ============================================================
// SUPER ADMIN AUTHENTICATION
// ============================================================

const superAdminMiddleware = async (req, res, next) => {
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

    // Require the Super Admin role.
    if (decodedToken.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Super Admin access required",
      });
    }

    // Confirm that the Super Admin exists and is active.
    const superAdmin = await SuperAdmin.findOne({
      firebaseUid: decodedToken.uid,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    if (!superAdmin) {
      return res.status(403).json({
        success: false,
        message: "Super Admin account is inactive or not found",
      });
    }

    req.superAdmin = superAdmin;

    return next();
  } catch (error) {
    console.error(
      "SUPER ADMIN MIDDLEWARE ERROR:",
      error.code || error.message
    );

    if (
      error.code &&
      error.code.startsWith("auth/")
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to verify Super Admin access",
    });
  }
};

module.exports = superAdminMiddleware;
