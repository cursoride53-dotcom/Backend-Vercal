
"use strict";

const express = require("express");
const router = express.Router();

const branchController = require("../controllers/branchController");

const {
  firebaseAuthMiddleware,
  requireSuperAdmin,
} = require("../middleware/firebaseAuthMiddleware");

// All branch routes require Super Admin authentication.
router.use(firebaseAuthMiddleware);
router.use(requireSuperAdmin);

// IMPORTANT: Specific routes must come before "/:id".
router.get("/dashboard", branchController.getBranchDashboard);
router.get("/overview", branchController.getBranchOverview);

// Get all branches and create a branch.
router.get("/", branchController.getBranches);
router.post("/", branchController.createBranch);

// Branch employee and assignment routes.
router.get("/:id/employees", branchController.getBranchEmployees);

router.patch(
  "/:id/assignments",
  branchController.updateBranchAssignments
);

router.patch(
  "/:id/working-hours",
  branchController.updateWorkingHours
);

router.patch("/:id/status", branchController.updateBranchStatus);

// Dynamic ID routes must come after specific routes.
router.get("/:id", branchController.getBranchById);
router.patch("/:id", branchController.updateBranch);
router.delete("/:id", branchController.deleteBranch);

module.exports = router;
