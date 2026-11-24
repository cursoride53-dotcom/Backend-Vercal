
"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/eodReportController");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

// Validate required controller functions.
const requiredHandlers = [
  "authenticateStaff",
  "requireManager",
  "submitReport",
  "myReports",
  "getMyReport",
  "managerReports",
  "approveReport",
  "rejectReport",
  "requestChanges",
  "adminReports",
  "adminReportDetails",
  "adminReportHistory",
  "adminEmployees",
];

for (const name of requiredHandlers) {
  if (typeof controller[name] !== "function") {
    throw new Error(
      `EOD route configuration error: controller.${name} is not a function. ` +
      "Check exports in src/controllers/eodReportController.js"
    );
  }
}

if (typeof superAdminMiddleware !== "function") {
  throw new Error(
    "EOD route configuration error: superAdminMiddleware is not a function."
  );
}

// Employee routes
router.post(
  "/submit",
  controller.authenticateStaff,
  controller.submitReport
);

router.get(
  "/my-reports",
  controller.authenticateStaff,
  controller.myReports
);

router.get(
  "/my-reports/:id",
  controller.authenticateStaff,
  controller.getMyReport
);

// Manager routes
router.get(
  "/manager/reports",
  controller.authenticateStaff,
  controller.requireManager,
  controller.managerReports
);

router.patch(
  "/manager/reports/:id/approve",
  controller.authenticateStaff,
  controller.requireManager,
  controller.approveReport
);

router.patch(
  "/manager/reports/:id/reject",
  controller.authenticateStaff,
  controller.requireManager,
  controller.rejectReport
);

router.patch(
  "/manager/reports/:id/request-changes",
  controller.authenticateStaff,
  controller.requireManager,
  controller.requestChanges
);

// Super Admin routes
// All routes beginning with /admin require Super Admin authentication.
router.use("/admin", superAdminMiddleware);

router.get("/admin/reports", controller.adminReports);

router.get(
  "/admin/reports/:id",
  controller.adminReportDetails
);

router.get(
  "/admin/reports/:id/history",
  controller.adminReportHistory
);

router.get("/admin/employees", controller.adminEmployees);

router.patch(
  "/admin/reports/:id/approve",
  controller.approveReport
);

router.patch(
  "/admin/reports/:id/reject",
  controller.rejectReport
);

router.patch(
  "/admin/reports/:id/request-changes",
  controller.requestChanges
);

module.exports = router;
