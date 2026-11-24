"use strict";

const crypto = require("crypto");

const generateOtp = () => {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
};

const hashOtp = (otp) => {
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
};

module.exports = {
  generateOtp,
  hashOtp
};