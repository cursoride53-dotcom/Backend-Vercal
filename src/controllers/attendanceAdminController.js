
"use strict";

const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");

const ALLOWED_REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
];

// =====================================================
// 1. PAGINATION HELPER
// =====================================================

function getPaginationValue(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

// =====================================================
// 2. ADMIN ATTENDANCE RECORDS
// GET /api/attendance/admin/records
// =====================================================

const adminRecords = async (req, res) => {
  try {
    const page = getPaginationValue(req.query.page, 1, 100000);
    const limit = getPaginationValue(req.query.limit, 10, 100);
    const skip = (page - 1) * limit;

    const { from, to, reviewStatus, search } = req.query;

    const filter = {};

    // Date filtering
    if (from || to) {
      filter.attendanceDate = {};

      if (from) {
        if (
          typeof from !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(from)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'from' date. Use YYYY-MM-DD.",
          });
        }

        filter.attendanceDate.$gte = from;
      }

      if (to) {
        if (
          typeof to !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(to)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid 'to' date. Use YYYY-MM-DD.",
          });
        }

        filter.attendanceDate.$lte = to;
      }

      if (from && to && from > to) {
        return res.status(400).json({
          success: false,
          message: "'from' date cannot be after 'to' date.",
        });
      }
    }

    // Review status filtering
    if (reviewStatus) {
      const normalizedStatus = String(reviewStatus)
        .trim()
        .toUpperCase();

      if (!ALLOWED_REVIEW_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reviewStatus filter.",
          allowedValues: ALLOWED_REVIEW_STATUSES,
        });
      }

      filter.reviewStatus = normalizedStatus;
    }

    // Employee search
    if (search && String(search).trim()) {
      const searchText = String(search).trim().slice(0, 100);

      const escapedSearch = searchText.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const searchRegex = new RegExp(escapedSearch, "i");

      filter.$or = [
        { employeeName: searchRegex },
        { employeeCode: searchRegex },
        { branch: searchRegex },
      ];
    }

    // IMPORTANT:
    // Explicitly select the selfie fields because the
    // Attendance schema has select: false for these fields.

    const [records, total, pendingCount, approvedCount, rejectedCount] =
      await Promise.all([
        Attendance.find(filter)
          .select("+checkInSelfiePath +checkOutSelfiePath")
          .populate("reviewedBy", "name email")
          .sort({
            attendanceDate: -1,
            checkInAt: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Attendance.countDocuments(filter),

        Attendance.countDocuments({
          ...filter,
          reviewStatus: "PENDING",
        }),

        Attendance.countDocuments({
          ...filter,
          reviewStatus: "APPROVED",
        }),

        Attendance.countDocuments({
          ...filter,
          reviewStatus: "REJECTED",
        }),
      ]);

    return res.status(200).json({
      success: true,
      message: "Attendance records fetched successfully.",

      data: records,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },

      summary: {
        total,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    console.error("ADMIN ATTENDANCE RECORDS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance records.",
    });
  }
};

// =====================================================
// 3. REVIEW ATTENDANCE RECORD
// PATCH /api/attendance/admin/records/:id/review
// =====================================================

const reviewRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance record ID.",
      });
    }

    if (typeof status !== "string") {
      return res.status(400).json({
        success: false,
        message: "Review status is required.",
      });
    }

    const normalizedStatus = status.trim().toUpperCase();

    if (!["APPROVED", "REJECTED"].includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Review status must be APPROVED or REJECTED.",
      });
    }

    if (
      note !== undefined &&
      note !== null &&
      typeof note !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Review note must be text.",
      });
    }

    const reviewNote = String(note || "").trim();

    if (reviewNote.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Review note cannot exceed 1000 characters.",
      });
    }

    if (normalizedStatus === "REJECTED" && !reviewNote) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for rejecting attendance.",
      });
    }

    // Super Admin authentication
    const superAdminId = req.superAdmin?._id;

    if (!superAdminId) {
      return res.status(403).json({
        success: false,
        message: "Authenticated Super Admin information is missing.",
      });
    }

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found.",
      });
    }

    if (attendance.reviewStatus === normalizedStatus) {
      return res.status(200).json({
        success: true,
        message: `Attendance is already ${normalizedStatus.toLowerCase()}.`,
        data: {
          id: attendance._id,
          reviewStatus: attendance.reviewStatus,
          reviewNote: attendance.reviewNote,
          reviewedAt: attendance.reviewedAt,
        },
      });
    }

    attendance.reviewStatus = normalizedStatus;
    attendance.reviewedBy = superAdminId;
    attendance.reviewedAt = new Date();
    attendance.reviewNote = reviewNote;

    await attendance.save();

    // Include Firebase selfie URLs in the updated response.
    const updatedRecord = await Attendance.findById(attendance._id)
      .select("+checkInSelfiePath +checkOutSelfiePath")
      .populate("reviewedBy", "name email")
      .lean();

    return res.status(200).json({
      success: true,
      message: `Attendance ${normalizedStatus.toLowerCase()} successfully.`,
      data: updatedRecord,
    });
  } catch (error) {
    console.error("ADMIN ATTENDANCE REVIEW ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review attendance record.",
    });
  }
};

// =====================================================
// 4. EXPORT CONTROLLERS
// =====================================================

module.exports = {
  adminRecords,
  reviewRecord,
};
