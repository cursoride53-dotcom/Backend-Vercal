// ============================================================
// src/config/firebase.js
// HRMS ZERMII - FIREBASE ADMIN CONFIGURATION
// ============================================================

"use strict";

const admin = require("firebase-admin");

// ============================================================
// READ ENVIRONMENT VARIABLES
// ============================================================

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

// ============================================================
// DEBUG CHECK
// ============================================================

console.log("========================================");
console.log("FIREBASE ENV CHECK");
console.log("========================================");
console.log("PROJECT ID:", projectId ? "LOADED" : "MISSING");
console.log("CLIENT EMAIL:", clientEmail ? "LOADED" : "MISSING");
console.log("PRIVATE KEY:", privateKey ? "LOADED" : "MISSING");
console.log("========================================");

// ============================================================
// VALIDATE ENVIRONMENT VARIABLES
// ============================================================

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Firebase configuration is missing. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env"
  );
}

// ============================================================
// FORMAT PRIVATE KEY
// ============================================================

const formattedPrivateKey = privateKey
  .replace(/\\n/g, "\n")
  .replace(/\r/g, "")
  .trim();

// ============================================================
// VALIDATE PRIVATE KEY FORMAT
// ============================================================

if (!formattedPrivateKey.includes("-----BEGIN PRIVATE KEY-----")) {
  throw new Error(
    "FIREBASE_PRIVATE_KEY is invalid: BEGIN PRIVATE KEY header is missing."
  );
}

if (!formattedPrivateKey.includes("-----END PRIVATE KEY-----")) {
  throw new Error(
    "FIREBASE_PRIVATE_KEY is invalid: END PRIVATE KEY footer is missing."
  );
}

// ============================================================
// INITIALIZE FIREBASE ADMIN
// ============================================================

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: formattedPrivateKey
      })
    });

    console.log("========================================");
    console.log("FIREBASE ADMIN INITIALIZED SUCCESSFULLY");
    console.log("PROJECT:", projectId);
    console.log("========================================");
  }
} catch (error) {
  console.error("========================================");
  console.error("FIREBASE INITIALIZATION ERROR");
  console.error(error.message);
  console.error("========================================");

  throw error;
}

// ============================================================
// EXPORT
// ============================================================

module.exports = admin;