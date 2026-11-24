"use strict";

const mongoose = require("mongoose");

const superAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    role: {
      type: String,
      default: "SUPER_ADMIN",
      enum: ["SUPER_ADMIN"]
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE"
    },

    firebaseUid: {
      type: String,
      default: null,
      index: true
    },

    lastLoginAt: {
      type: Date,
      default: null
    },

    lastLoginIp: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "SuperAdmin",
  superAdminSchema
);