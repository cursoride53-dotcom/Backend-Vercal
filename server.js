"use strict";

const path = require("path");

// ============================================================
// LOAD .ENV FIRST
// ============================================================

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

console.log("========================================");
console.log("ENVIRONMENT CHECK");
console.log("========================================");
console.log("ENV FILE:", path.join(__dirname, ".env"));
console.log(
  "FIREBASE_PROJECT_ID:",
  process.env.FIREBASE_PROJECT_ID ? "LOADED" : "MISSING"
);
console.log(
  "FIREBASE_CLIENT_EMAIL:",
  process.env.FIREBASE_CLIENT_EMAIL ? "LOADED" : "MISSING"
);
console.log(
  "FIREBASE_PRIVATE_KEY:",
  process.env.FIREBASE_PRIVATE_KEY ? "LOADED" : "MISSING"
);
console.log("========================================");

// ============================================================
// IMPORT APP / DATABASE AFTER ENV IS LOADED
// ============================================================

const app = require("./src/app");
const connectDB = require("./src/config/db");

// ============================================================
// PORT
// ============================================================

const PORT = process.env.PORT || 5000;

// ============================================================
// START SERVER
// ============================================================

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log("========================================");
      console.log("HRMS BACKEND STARTED");
      console.log(`PORT: ${PORT}`);
      console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
      console.log("========================================");
    });
  } catch (error) {
    console.error("SERVER START ERROR:", error.message);
    process.exit(1);
  }
};

startServer();