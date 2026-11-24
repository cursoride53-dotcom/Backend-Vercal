
"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/employeeAdvanceController");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

// ============================================================
// EMPLOYEE ENDPOINTS
// Firebase-authenticated employee only
// ============================================================

router.post(
  "/requests",
  controller.authenticateEmployee,
  controller.createEmployeeRequest
);

router.get(
  "/my-requests",
  controller.authenticateEmployee,
  controller.listMyRequests
);

// ============================================================
// SUPER ADMIN ENDPOINTS
// Existing middleware verifies Firebase and Super Admin status.
// ============================================================

router.use(superAdminMiddleware);

// GET /api/employee-advances/admin
router.get(
  "/admin",
  controller.listAdminRequests
);

// POST /api/employee-advances/admin
// Create an advance request for a selected employee.
router.post(
  "/admin",
  controller.createAdminAdvance
);

// GET /api/employee-advances/admin/:id
router.get(
  "/admin/:id",
  controller.getAdvanceById
);

// PATCH /api/employee-advances/admin/:id/approve
router.patch(
  "/admin/:id/approve",
  controller.approveAdvance
);

// PATCH /api/employee-advances/admin/:id/reject
router.patch(
  "/admin/:id/reject",
  controller.rejectAdvance
);

// PATCH /api/employee-advances/admin/:id/disburse
router.patch(
  "/admin/:id/disburse",
  controller.disburseAdvance
);

module.exports = router;
