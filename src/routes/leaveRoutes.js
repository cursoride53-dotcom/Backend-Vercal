
"use strict";

const express = require("express");
const router = express.Router();

const leaveController = require("../controllers/leaveController");

const {
  employeeAuthMiddleware,
  requireEmployee,
} = require("../middleware/employeeAuthMiddleware");

const superAdminMiddleware = require("../middleware/superAdminMiddleware");

// Validate middleware configuration
if (typeof employeeAuthMiddleware !== "function") {
  throw new Error("employeeAuthMiddleware must be a function.");
}

if (typeof requireEmployee !== "function") {
  throw new Error("requireEmployee must be a function.");
}

if (typeof superAdminMiddleware !== "function") {
  throw new Error("superAdminMiddleware must be a function.");
}

// Validate leave controller handlers
const requiredHandlers = [
  "applyLeave",
  "myLeaves",
  "myLeaveById",
  "cancelLeave",
  "adminEmployees",
  "adminCreateLeave",
  "adminLeaves",
  "adminLeaveById",
  "reviewLeave",
];

for (const name of requiredHandlers) {
  if (typeof leaveController[name] !== "function") {
    throw new Error(
      `Leave route configuration error: leaveController.${name} must be a function.`
    );
  }
}

// Employee leave routes
router.post(
  "/my",
  employeeAuthMiddleware,
  requireEmployee,
  leaveController.applyLeave
);

router.get(
  "/my",
  employeeAuthMiddleware,
  requireEmployee,
  leaveController.myLeaves
);

router.get(
  "/my/:id",
  employeeAuthMiddleware,
  requireEmployee,
  leaveController.myLeaveById
);

router.patch(
  "/my/:id/cancel",
  employeeAuthMiddleware,
  requireEmployee,
  leaveController.cancelLeave
);

// Super Admin authentication for all admin routes
router.use("/admin", superAdminMiddleware);

// IMPORTANT: Define specific routes before /admin/:id
router.get(
  "/admin/employees",
  leaveController.adminEmployees
);

router.post(
  "/admin/create-for-employee",
  leaveController.adminCreateLeave
);

router.patch(
  "/admin/:id/review",
  leaveController.reviewLeave
);

router.get(
  "/admin",
  leaveController.adminLeaves
);

router.get(
  "/admin/:id",
  leaveController.adminLeaveById
);

module.exports = router;
