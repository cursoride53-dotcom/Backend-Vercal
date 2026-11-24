
"use strict";

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const Attendance = require("../models/Attendance");

const {
  TIMEZONE,
  getLocalDate,
  validDateString,
  calculateWorkedMinutes,
} = require("../utils/attendanceTime");

function getEmployee(req) {
  return req.employee || null;
}

function getEmployeeName(employee) {
  return (
    employee.fullName ||
    employee.name ||
    employee.displayName ||
    employee.email ||
    "Employee"
  );
}

function getEmployeeCode(employee) {
  return employee.employeeCode || employee.employeeId || "";
}

function getEmployeeBranch(employee) {
  // Adjust this if your Employee model stores a branch ObjectId.
  return (
    employee.branchName ||
    employee.branch ||
    employee.branchId ||
    "Unassigned"
  );
}

function getOptionalLocation(body) {
  const hasLatitude =
    body.latitude !== undefined && body.latitude !== "";

  const hasLongitude =
    body.longitude !== undefined && body.longitude !== "";

  if (!hasLatitude && !hasLongitude) {
    return undefined;
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  const accuracyMeters =
    body.accuracyMeters === undefined ||
    body.accuracyMeters === ""
      ? undefined
      : Number(body.accuracyMeters);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    const error = new Error(
      "Valid latitude and longitude are required"
    );
    error.status = 400;
    throw error;
  }

  if (
    accuracyMeters !== undefined &&
    (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)
  ) {
    const error = new Error(
      "Invalid location accuracy"
    );
    error.status = 400;
    throw error;
  }

  return {
    latitude,
    longitude,
    ...(accuracyMeters !== undefined
      ? { accuracyMeters }
      : {}),
  };
}

function removeUploadedFile(file) {
  if (file && file.path) {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error(
        "SELFIE CLEANUP ERROR:",
        error.message
      );
    }
  }
}

function serializeAttendance(record) {
  if (!record) return null;

  const data = record.toObject
    ? record.toObject()
    : { ...record };

  // Never return the absolute server filesystem path.
  if (data.checkInSelfiePath) {
    data.checkInSelfiePath = path.basename(
      data.checkInSelfiePath
    );
  }

  if (data.checkOutSelfiePath) {
    data.checkOutSelfiePath = path.basename(
      data.checkOutSelfiePath
    );
  }

  return data;
}

function sendError(res, error) {
  if (error && error.code === 11000) {
    return res.status(409).json({
      success: false,
      message:
        "Attendance already exists for this employee and date",
    });
  }

  const status = error.status || 500;

  if (status === 500) {
    console.error("ATTENDANCE ERROR:", error);
  }

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? "Attendance operation failed"
        : error.message,
  });
}

// POST /api/attendance/check-in
exports.checkIn = async (req, res) => {
  try {
    const employee = getEmployee(req);

    if (
      !employee ||
      !mongoose.isValidObjectId(employee._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Registered employee identity is missing",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please capture and upload a selfie",
      });
    }

    const attendanceDate = getLocalDate(
      new Date(),
      TIMEZONE
    );

    const location = getOptionalLocation(req.body);

    const existing = await Attendance.findOne({
      employee: employee._id,
      attendanceDate,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "You have already checked in for today",
      });
    }

    const record = await Attendance.create({
      employee: employee._id,
      employeeCode: getEmployeeCode(employee),
      employeeName: getEmployeeName(employee),
      branch: String(getEmployeeBranch(employee)),
      attendanceDate,
      timezone: TIMEZONE,
      checkInAt: new Date(),
      checkInSelfiePath: req.file.path,
      ...(location
        ? { checkInLocation: location }
        : {}),
    });

    return res.status(201).json({
      success: true,
      message: "Attendance check-in successful",
      data: serializeAttendance(record),
    });
  } catch (error) {
    removeUploadedFile(req.file);
    return sendError(res, error);
  }
};

// POST /api/attendance/check-out
exports.checkOut = async (req, res) => {
  try {
    const employee = getEmployee(req);

    if (
      !employee ||
      !mongoose.isValidObjectId(employee._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Registered employee identity is missing",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please capture and upload a selfie",
      });
    }

    const attendanceDate = getLocalDate(
      new Date(),
      TIMEZONE
    );

    const location = getOptionalLocation(req.body);

    const record = await Attendance.findOne({
      employee: employee._id,
      attendanceDate,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message:
          "Check-in not found. Please check in first.",
      });
    }

    if (record.checkOutAt) {
      return res.status(409).json({
        success: false,
        message:
          "You have already checked out for today",
      });
    }

    const checkOutAt = new Date();

    const workedMinutes = calculateWorkedMinutes(
      record.checkInAt,
      checkOutAt
    );

    record.checkOutAt = checkOutAt;
    record.checkOutSelfiePath = req.file.path;
    record.workedMinutes = workedMinutes;

    if (location) {
      record.checkOutLocation = location;
    }

    await record.save();

    return res.json({
      success: true,
      message: "Attendance check-out successful",
      data: serializeAttendance(record),
    });
  } catch (error) {
    removeUploadedFile(req.file);
    return sendError(res, error);
  }
};

// GET /api/attendance/me/today
exports.today = async (req, res) => {
  try {
    const employee = getEmployee(req);

    if (
      !employee ||
      !mongoose.isValidObjectId(employee._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Registered employee identity is missing",
      });
    }

    const attendanceDate = getLocalDate(
      new Date(),
      TIMEZONE
    );

    const record = await Attendance.findOne({
      employee: employee._id,
      attendanceDate,
    })
      .select("+checkInSelfiePath +checkOutSelfiePath")
      .lean();

    return res.json({
      success: true,
      data: serializeAttendance(record),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// GET /api/attendance/me/history?from=2026-10-01&to=2026-10-31
exports.myHistory = async (req, res) => {
  try {
    const employee = getEmployee(req);

    if (
      !employee ||
      !mongoose.isValidObjectId(employee._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Registered employee identity is missing",
      });
    }

    const { from, to } = req.query;

    if (
      (from && !validDateString(from)) ||
      (to && !validDateString(to))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Dates must use YYYY-MM-DD format",
      });
    }

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message:
          "The from date cannot be after the to date",
      });
    }

    const page = Math.max(
      1,
      Number.parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(req.query.limit, 10) || 20
      )
    );

    const filter = {
      employee: employee._id,
    };

    if (from || to) {
      filter.attendanceDate = {};

      if (from) {
        filter.attendanceDate.$gte = from;
      }

      if (to) {
        filter.attendanceDate.$lte = to;
      }
    }

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .sort({ attendanceDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Attendance.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: records.map(serializeAttendance),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// Super Admin reports and review will be added in a separate controller file.
