
"use strict";

const admin = require("../config/firebase");
const SuperAdmin = require("../models/SuperAdmin");

const firebaseAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Valid Bearer token is required",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    // Verify the Firebase ID token, not the custom token.
    const decodedToken = await admin
      .auth()
      .verifyIdToken(token, true);

    req.user = decodedToken;

    // Find the Super Admin using the verified Firebase UID.
    const superAdmin = await SuperAdmin.findOne({
      firebaseUid: decodedToken.uid,
      role: "SUPER_ADMIN",
    });

    if (!superAdmin) {
      console.error(
        "SUPER ADMIN RECORD NOT FOUND FOR FIREBASE UID:",
        decodedToken.uid
      );

      return res.status(403).json({
        success: false,
        message: "Authenticated Super Admin record not found",
      });
    }

    if (superAdmin.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Super Admin account is inactive",
      });
    }

    // Make the database record available to controllers.
    req.superAdmin = superAdmin;

    next();
  } catch (error) {
    console.error(
      "FIREBASE AUTH ERROR:",
      error.code || error.message
    );

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

// Use after firebaseAuthMiddleware.
const requireSuperAdmin = (req, res, next) => {
  if (
    !req.user ||
    !req.superAdmin ||
    req.superAdmin.role !== "SUPER_ADMIN"
  ) {
    return res.status(403).json({
      success: false,
      message: "Super Admin access required",
    });
  }

  next();
};

module.exports = {
  firebaseAuthMiddleware,
  requireSuperAdmin,
};
