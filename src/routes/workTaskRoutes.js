
"use strict";

const express = require("express");
const router = express.Router();

const workTaskController = require("../controllers/workTaskController");

const {
  firebaseAuthMiddleware,
  requireSuperAdmin,
} = require("../middleware/firebaseAuthMiddleware");

// Protect all task-management routes.
// Only authenticated Super Admins can manage task assignments.
router.use(firebaseAuthMiddleware);
router.use(requireSuperAdmin);

// Get all tasks, with optional branch, employee, status and priority filters.
router.get("/", workTaskController.getTasks);

// Create and assign a task.
router.post("/", workTaskController.createTask);

// Get one task by MongoDB ID.
router.get("/:id", workTaskController.getTaskById);

// Update task details or reassign an employee.
router.patch("/:id", workTaskController.updateTask);

// Update task progress/status.
router.patch("/:id/status", workTaskController.updateTaskStatus);

// Cancel a task without deleting its history.
router.delete("/:id", workTaskController.cancelTask);

module.exports = router;
