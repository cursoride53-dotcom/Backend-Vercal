
"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/superAdminAuthController");

const {
  firebaseAuthMiddleware,
  requireSuperAdmin,
} = require("../middleware/firebaseAuthMiddleware");

// Public: send email OTP
router.post("/send-otp", controller.sendLoginOtp);

// Public: verify email OTP
router.post("/verify-otp", controller.verifyLoginOtp);

// Protected: get current Super Admin profile
router.get(
  "/me",
  firebaseAuthMiddleware,
  requireSuperAdmin,
  controller.getMe
);

// Protected: logout
router.post(
  "/logout",
  firebaseAuthMiddleware,
  requireSuperAdmin,
  controller.logoutSuperAdmin
);

module.exports = router;
