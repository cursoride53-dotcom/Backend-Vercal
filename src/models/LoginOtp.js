"use strict";

const mongoose = require("mongoose");

const loginOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },

    otpHash: {
      type: String,
      required: true
    },

    attempts: {
      type: Number,
      default: 0
    },

    used: {
      type: Boolean,
      default: false
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "LoginOtp",
  loginOtpSchema
);