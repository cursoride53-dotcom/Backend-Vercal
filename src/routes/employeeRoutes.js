


"use strict";

const express = require("express");
const router = express.Router();

const employeeController = require("../controllers/employeeController");

const {
  firebaseAuthMiddleware,
  requireSuperAdmin,
} = require("../middleware/firebaseAuthMiddleware");

const {
  employeeAuthMiddleware,
  requireEmployee,
} = require("../middleware/employeeAuthMiddleware");

// --------------------------------------------------
// Validate middleware
// --------------------------------------------------

if (typeof firebaseAuthMiddleware !== "function") {
  throw new Error("firebaseAuthMiddleware must be a function.");
}

if (typeof requireSuperAdmin !== "function") {
  throw new Error("requireSuperAdmin must be a function.");
}

if (typeof employeeAuthMiddleware !== "function") {
  throw new Error("employeeAuthMiddleware must be a function.");
}

if (typeof requireEmployee !== "function") {
  throw new Error("requireEmployee must be a function.");
}

// --------------------------------------------------
// Validate controller handlers
// --------------------------------------------------

const requiredHandlers = [
  "createEmployee",
  "listEmployees",
  "getEmployee",
  "updateEmployee",
  "deleteEmployee",
  "getMyProfile",
  "updateMyProfile",
  "loginEmployee",
  "logoutEmployee",
];

for (const handlerName of requiredHandlers) {
  if (typeof employeeController[handlerName] !== "function") {
    throw new Error(
      `Employee route configuration error: employeeController.${handlerName} must be a function.`
    );
  }
}

// --------------------------------------------------
// EMPLOYEE AUTHENTICATION
// Base URL: /api/employee/auth
// --------------------------------------------------

// Verify Firebase ID token after frontend Firebase login.
// Login requires the Firebase ID token in the request body.
router.post("/login", employeeController.loginEmployee);

// Logout the authenticated employee.
router.post(
  "/logout",
  employeeAuthMiddleware,
  requireEmployee,
  employeeController.logoutEmployee
);

// --------------------------------------------------
// EMPLOYEE PROFILE
// --------------------------------------------------

router.get(
  "/me/profile",
  employeeAuthMiddleware,
  requireEmployee,
  employeeController.getMyProfile
);

router.patch(
  "/me/profile",
  employeeAuthMiddleware,
  requireEmployee,
  employeeController.updateMyProfile
);

// --------------------------------------------------
// SUPER ADMIN EMPLOYEE MANAGEMENT
// --------------------------------------------------

// All routes below require Super Admin authentication.
router.use(
  "/",
  firebaseAuthMiddleware,
  requireSuperAdmin
);

// Create employee
router.post("/", employeeController.createEmployee);

// List employees
router.get("/", employeeController.listEmployees);

// Get employee details
router.get("/:id", employeeController.getEmployee);

// Update employee
router.patch("/:id", employeeController.updateEmployee);

// Soft-delete employee
router.delete("/:id", employeeController.deleteEmployee);

module.exports = router;
