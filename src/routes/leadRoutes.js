
"use strict";

const express = require("express");
const router = express.Router();

// ==================================================
// IMPORT CONTROLLERS
// ==================================================

const leadController = require("../controllers/leadController");

// ==================================================
// IMPORT EMPLOYEE MIDDLEWARE
// Your middleware exports an object containing functions.
// ==================================================

const employeeAuth = require("../middleware/employeeAuthMiddleware");

const employeeAuthMiddleware =
  typeof employeeAuth === "function"
    ? employeeAuth
    : employeeAuth?.employeeAuthMiddleware;

const requireEmployee =
  typeof employeeAuth === "function"
    ? null
    : employeeAuth?.requireEmployee;

// ==================================================
// IMPORT SUPER ADMIN MIDDLEWARE
// ==================================================

const superAdminMiddleware = require("../middleware/superAdminMiddleware");

// ==================================================
// VALIDATE MIDDLEWARE
// ==================================================

if (typeof employeeAuthMiddleware !== "function") {
  throw new Error(
    "Lead routes: employeeAuthMiddleware is missing. Check src/middleware/employeeAuthMiddleware.js."
  );
}

if (typeof requireEmployee !== "function") {
  throw new Error(
    "Lead routes: requireEmployee is missing. Check src/middleware/employeeAuthMiddleware.js."
  );
}

if (typeof superAdminMiddleware !== "function") {
  throw new Error(
    "Lead routes: superAdminMiddleware must export a function."
  );
}

// ==================================================
// VALIDATE CONTROLLER FUNCTIONS
// ==================================================

const requiredHandlers = [
  "createMyLead",
  "myLeads",
  "getMyLead",
  "updateMyLead",
  "adminList",
  "adminCreate",
  "adminDetails",
  "adminUpdate",
  "adminDelete",
  "adminOptions",
  "adminHistory",
  "statuses",
];

for (const name of requiredHandlers) {
  if (typeof leadController[name] !== "function") {
    throw new Error(
      `Lead routes: leadController.${name} is missing or is not a function.`
    );
  }
}

// ==================================================
// EMPLOYEE LEAD ROUTES
// Base URL: /api/leads
// ==================================================

// Create a lead
router.post(
  "/my",
  employeeAuthMiddleware,
  requireEmployee,
  leadController.createMyLead
);

// List the logged-in employee's leads
router.get(
  "/my",
  employeeAuthMiddleware,
  requireEmployee,
  leadController.myLeads
);

// Get one employee lead
router.get(
  "/my/:id",
  employeeAuthMiddleware,
  requireEmployee,
  leadController.getMyLead
);

// Update one employee lead
router.patch(
  "/my/:id",
  employeeAuthMiddleware,
  requireEmployee,
  leadController.updateMyLead
);

// ==================================================
// SUPER ADMIN ROUTES
// All /admin endpoints require Super Admin authentication.
// ==================================================

router.use("/admin", superAdminMiddleware);

// Get lead statuses
router.get(
  "/admin/statuses",
  leadController.statuses
);

// Get branch and employee dropdown options
router.get(
  "/admin/options",
  leadController.adminOptions
);

// List all leads with filters and pagination
router.get(
  "/admin",
  leadController.adminList
);

// Create a lead
router.post(
  "/admin",
  leadController.adminCreate
);

// Get a lead's history
router.get(
  "/admin/:id/history",
  leadController.adminHistory
);

// Get lead details
router.get(
  "/admin/:id",
  leadController.adminDetails
);

// Update a lead
router.patch(
  "/admin/:id",
  leadController.adminUpdate
);

// Soft-delete a lead
router.delete(
  "/admin/:id",
  leadController.adminDelete
);

// ==================================================
// EXPORT ROUTER
// ==================================================

module.exports = router;
