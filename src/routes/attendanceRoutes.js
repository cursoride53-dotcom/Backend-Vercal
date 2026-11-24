
"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const attendanceController = require("../controllers/attendanceController");
const attendanceAdminController = require("../controllers/attendanceAdminController");

const attendanceAuth = require("../middleware/attendanceAuth");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

const router = express.Router();

// =====================================================
// 1. VALIDATE IMPORTS
// =====================================================

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

requireHandler("attendanceController.checkIn", attendanceController.checkIn);
requireHandler("attendanceController.checkOut", attendanceController.checkOut);
requireHandler("attendanceController.today", attendanceController.today);
requireHandler("attendanceController.myHistory", attendanceController.myHistory);

requireHandler(
  "attendanceAdminController.adminRecords",
  attendanceAdminController.adminRecords
);

requireHandler(
  "attendanceAdminController.reviewRecord",
  attendanceAdminController.reviewRecord
);

// =====================================================
// 2. SELFIE UPLOAD CONFIGURATION
// =====================================================

// Vercel has a temporary writable directory at /tmp.
// Local development uses the project's uploads directory.

const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), "attendance-selfies")
  : path.resolve(
      process.env.ATTENDANCE_UPLOAD_DIR ||
      path.join(process.cwd(), "uploads", "attendance-selfies")
    );

// Create directory if it does not exist.
try {
  fs.mkdirSync(uploadDirectory, { recursive: true });
  console.log("ATTENDANCE UPLOAD DIRECTORY:", uploadDirectory);
} catch (error) {
  console.error(
    "ATTENDANCE UPLOAD DIRECTORY ERROR:",
    error.message
  );
  throw error;
}

// Maximum selfie size in MB.
const maxFileSizeMB = Math.max(
  1,
  Number(process.env.ATTENDANCE_MAX_SELFIE_MB) || 5
);

// Allowed image formats.
const allowedMimeTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// =====================================================
// 3. MULTER STORAGE
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
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

    const safeEmployeeId = employeeId.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );

    const filename =
      `${safeEmployeeId}-${Date.now()}-` +
      `${crypto.randomBytes(8).toString("hex")}${extension}`;

    return callback(null, filename);
  },
});

// =====================================================
// 4. SELFIE UPLOAD MIDDLEWARE
// =====================================================

const uploadSelfie = multer({
  storage,

  limits: {
    fileSize: maxFileSizeMB * 1024 * 1024,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes[file.mimetype]) {
      return callback(
        new Error("Selfie must be a JPEG, PNG, or WEBP image.")
      );
    }

    return callback(null, true);
  },
});

// =====================================================
// 5. EMPLOYEE ATTENDANCE ROUTES
// =====================================================

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

// =====================================================
// 6. SUPER ADMIN ATTENDANCE ROUTES
// =====================================================

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

// =====================================================
// 7. ATTENDANCE ROUTE ERROR HANDLER
// =====================================================

router.use((error, req, res, next) => {
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
