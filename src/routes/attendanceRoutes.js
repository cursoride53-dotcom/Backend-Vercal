"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const attendanceController = require("../controllers/attendanceController");
const attendanceAdminController = require("../controllers/attendanceAdminController");

const attendanceAuth = require("../middleware/attendanceAuth");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

const router = express.Router();

/* =====================================================
   1. VALIDATE IMPORTS
===================================================== */

function requireHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `[ATTENDANCE ROUTES] "${name}" is not a function. ` +
      "Check the corresponding controller or middleware export."
    );
  }
}

requireHandler("attendanceAuth", attendanceAuth);
requireHandler("superAdminMiddleware", superAdminMiddleware);

requireHandler(
  "attendanceController.checkIn",
  attendanceController.checkIn
);

requireHandler(
  "attendanceController.checkOut",
  attendanceController.checkOut
);

requireHandler(
  "attendanceController.today",
  attendanceController.today
);

requireHandler(
  "attendanceController.myHistory",
  attendanceController.myHistory
);

requireHandler(
  "attendanceAdminController.adminRecords",
  attendanceAdminController.adminRecords
);

requireHandler(
  "attendanceAdminController.reviewRecord",
  attendanceAdminController.reviewRecord
);

/* =====================================================
   2. PRIVATE SELFIE UPLOAD CONFIGURATION
===================================================== */

const uploadDirectory = path.resolve(
  process.env.ATTENDANCE_UPLOAD_DIR ||
    path.join("uploads", "attendance-selfies")
);

const maxFileSizeMB = Math.max(
  1,
  Number(process.env.ATTENDANCE_MAX_SELFIE_MB) || 5
);

const allowedMimeTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = allowedMimeTypes[file.mimetype];

    if (!extension) {
      return callback(
        new Error("Only JPEG, PNG, and WEBP selfies are allowed.")
      );
    }

    const employeeId = req.employee?._id
      ? String(req.employee._id)
      : "employee";

    const safeEmployeeId = employeeId.replace(/[^a-zA-Z0-9_-]/g, "");

    const filename =
      `${safeEmployeeId}-${Date.now()}-` +
      `${crypto.randomBytes(8).toString("hex")}${extension}`;

    return callback(null, filename);
  },
});

const uploadSelfie = multer({
  storage,

  limits: {
    fileSize: maxFileSizeMB * 1024 * 1024,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes[file.mimetype]) {
      return callback(
        new Error("Selfie must be a JPEG, PNG, or WEBP image.")
      );
    }

    return callback(null, true);
  },
});

/* =====================================================
   3. EMPLOYEE ATTENDANCE ROUTES
===================================================== */

// POST /api/attendance/check-in
router.post(
  "/check-in",
  attendanceAuth,
  uploadSelfie.single("selfie"),
  attendanceController.checkIn
);

// POST /api/attendance/check-out
router.post(
  "/check-out",
  attendanceAuth,
  uploadSelfie.single("selfie"),
  attendanceController.checkOut
);

// GET /api/attendance/me/today
router.get(
  "/me/today",
  attendanceAuth,
  attendanceController.today
);

// GET /api/attendance/me/history
router.get(
  "/me/history",
  attendanceAuth,
  attendanceController.myHistory
);

/* =====================================================
   4. SUPER ADMIN ATTENDANCE ROUTES
===================================================== */

// GET /api/attendance/admin/records?page=1&limit=10
router.get(
  "/admin/records",
  superAdminMiddleware,
  attendanceAdminController.adminRecords
);

// PATCH /api/attendance/admin/records/:id/review
router.patch(
  "/admin/records/:id/review",
  superAdminMiddleware,
  attendanceAdminController.reviewRecord
);

/* =====================================================
   5. ATTENDANCE ROUTE ERROR HANDLER
===================================================== */

router.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: `Selfie cannot exceed ${maxFileSizeMB} MB.`,
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Upload only one selfie per request.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Selfie upload failed.",
    });
  }

  if (error) {
    console.error("ATTENDANCE ROUTE ERROR:", error.message);

    const isUploadValidationError =
      error.message ===
        "Only JPEG, PNG, and WEBP selfies are allowed." ||
      error.message ===
        "Selfie must be a JPEG, PNG, or WEBP image.";

    return res.status(isUploadValidationError ? 400 : 500).json({
      success: false,
      message: isUploadValidationError
        ? error.message
        : "An attendance request failed.",
    });
  }

  return next();
});

module.exports = router;
