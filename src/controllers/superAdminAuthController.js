"use strict";

const SuperAdmin = require("../models/SuperAdmin");
const LoginOtp = require("../models/LoginOtp");

const admin = require("../config/firebase");

const {
  generateOtp,
  hashOtp
} = require("../utils/otp");

const {
  sendLoginOtpEmail
} = require("../utils/email");

// ============================================================
// SEND OTP
// POST /api/super-admin/auth/send-otp
// ============================================================

const sendLoginOtp = async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address"
      });
    }

    const superAdmin =
      await SuperAdmin.findOne({
        email,
        role: "SUPER_ADMIN"
      });

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message: "Invalid Super Admin email"
      });
    }

    if (superAdmin.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message:
          "Super Admin account is inactive"
      });
    }

    // Remove previous active OTPs
    await LoginOtp.deleteMany({
      email,
      used: false
    });

    const otp = generateOtp();

    const otpHash = hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + 5 * 60 * 1000
    );

    await LoginOtp.create({
      email,
      otpHash,
      attempts: 0,
      used: false,
      expiresAt
    });

    await sendLoginOtpEmail({
      email,
      otp,
      name: superAdmin.name
    });

    return res.status(200).json({
      success: true,
      message:
        "OTP sent successfully to your email",
      expiresIn: 300
    });

  } catch (error) {
    console.error(
      "SEND LOGIN OTP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to send OTP"
    });
  }
};

// ============================================================
// VERIFY OTP
// POST /api/super-admin/auth/verify-otp
// ============================================================

const verifyLoginOtp = async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    const otp = String(
      req.body.otp || ""
    ).trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message:
          "Email and OTP are required"
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message:
          "OTP must contain exactly 6 digits"
      });
    }

    const superAdmin =
      await SuperAdmin.findOne({
        email,
        role: "SUPER_ADMIN"
      });

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authentication request"
      });
    }

    if (superAdmin.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message:
          "Super Admin account is inactive"
      });
    }

    const loginOtp =
      await LoginOtp.findOne({
        email,
        used: false
      }).sort({
        createdAt: -1
      });

    if (!loginOtp) {
      return res.status(400).json({
        success: false,
        message:
          "OTP not found. Request a new OTP."
      });
    }

    if (
      loginOtp.expiresAt.getTime() <=
      Date.now()
    ) {
      loginOtp.used = true;

      await loginOtp.save();

      return res.status(400).json({
        success: false,
        message:
          "OTP expired. Request a new OTP."
      });
    }

    if (loginOtp.attempts >= 5) {
      loginOtp.used = true;

      await loginOtp.save();

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts"
      });
    }

    const incomingHash =
      hashOtp(otp);

    if (
      incomingHash !==
      loginOtp.otpHash
    ) {
      loginOtp.attempts += 1;

      if (loginOtp.attempts >= 5) {
        loginOtp.used = true;
      }

      await loginOtp.save();

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
        remainingAttempts:
          Math.max(
            0,
            5 - loginOtp.attempts
          )
      });
    }

    // OTP is valid
    loginOtp.used = true;

    await loginOtp.save();

    // ========================================================
    // FIND OR CREATE FIREBASE USER
    // ========================================================

    let firebaseUser;

    try {
      firebaseUser =
        await admin
          .auth()
          .getUserByEmail(email);

    } catch (error) {
      if (
        error.code ===
        "auth/user-not-found"
      ) {
        firebaseUser =
          await admin
            .auth()
            .createUser({
              email,
              emailVerified: true,
              displayName:
                superAdmin.name
            });
      } else {
        throw error;
      }
    }

    // Make sure Firebase email is verified
    if (!firebaseUser.emailVerified) {
      firebaseUser =
        await admin
          .auth()
          .updateUser(
            firebaseUser.uid,
            {
              emailVerified: true
            }
          );
    }

    // ========================================================
    // SAVE FIREBASE UID
    // ========================================================

    superAdmin.firebaseUid =
      firebaseUser.uid;

    superAdmin.lastLoginAt =
      new Date();

    superAdmin.lastLoginIp =
      req.ip || null;

    await superAdmin.save();

    // ========================================================
    // FIREBASE CUSTOM TOKEN
    // ========================================================

    const firebaseToken =
      await admin
        .auth()
        .createCustomToken(
          firebaseUser.uid,
          {
            role: "SUPER_ADMIN",
            superAdminId:
              superAdmin._id.toString()
          }
        );

    return res.status(200).json({
      success: true,
      message: "Login successful",

      firebaseToken,

      user: {
        id: superAdmin._id,
        firebaseUid:
          superAdmin.firebaseUid,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        status: superAdmin.status
      }
    });

  } catch (error) {
    console.error(
      "VERIFY LOGIN OTP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to complete login"
    });
  }
};

// ============================================================
// LOGOUT
// POST /api/super-admin/auth/logout
// ============================================================

const logoutSuperAdmin = async (
  req,
  res
) => {
  try {
    const firebaseUid =
      req.user?.uid;

    if (firebaseUid) {
      await admin
        .auth()
        .revokeRefreshTokens(
          firebaseUid
        );
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (error) {
    console.error(
      "LOGOUT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Logout failed"
    });
  }
};

// ============================================================
// CURRENT USER
// GET /api/super-admin/auth/me
// ============================================================

const getMe = async (req, res) => {
  try {
    if (!req.superAdmin) {
      return res.status(404).json({
        success: false,
        message: "Super Admin record not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: req.superAdmin,
    });
  } catch (error) {
    console.error("GET ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get current user",
    });
  }
};

module.exports = {
  sendLoginOtp,
  verifyLoginOtp,
  logoutSuperAdmin,
  getMe
};