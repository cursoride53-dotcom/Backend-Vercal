
"use strict";

const express = require("express");
const router = express.Router();

const payrollController = require("../controllers/payrollController");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

// ============================================================
// SUPER ADMIN AUTHENTICATION
// ============================================================

// This middleware already verifies:
// 1. Firebase authentication token
// 2. SUPER_ADMIN role
// 3. Active Super Admin account
router.use(superAdminMiddleware);

// ============================================================
// EMPLOYEES
// GET /api/payroll/admin/employees
// ============================================================

router.get(
  "/admin/employees",
  payrollController.getEmployees
);

// ============================================================
// SALARY CONFIGURATION
// ============================================================

// GET /api/payroll/admin/salaries
router.get(
  "/admin/salaries",
  payrollController.listSalaries
);

// PUT /api/payroll/admin/salaries/:employeeId
router.put(
  "/admin/salaries/:employeeId",
  payrollController.setEmployeeSalary
);

// ============================================================
// GENERATE MONTHLY PAYROLL
// POST /api/payroll/admin/generate
// Body: { "payrollMonth": "2026-10" }
// ============================================================

router.post(
  "/admin/generate",
  payrollController.generateMonthlyPayroll
);

// ============================================================
// LIST MONTHLY PAYROLL
// GET /api/payroll/admin?payrollMonth=2026-10
// ============================================================

router.get(
  "/admin",
  payrollController.listMonthlyPayroll
);

// ============================================================
// GET ONE PAYROLL RECORD
// GET /api/payroll/admin/:id
// ============================================================

router.get(
  "/admin/:id",
  payrollController.getPayrollById
);

// ============================================================
// APPROVE PAYROLL
// PATCH /api/payroll/admin/:id/approve
// ============================================================

router.patch(
  "/admin/:id/approve",
  payrollController.approvePayroll
);

// ============================================================
// MARK PAYROLL AS PAID
// PATCH /api/payroll/admin/:id/mark-paid
// Body: { "paymentReference": "BANK-TRANSFER-001" }
// ============================================================

router.patch(
  "/admin/:id/mark-paid",
  payrollController.markPayrollPaid
);

module.exports = router;
