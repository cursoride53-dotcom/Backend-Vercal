
"use strict";

// ============================================================
// HRMS ZERMII - FIREBASE ADMIN CONFIGURATION
// ============================================================

const admin = require("firebase-admin");
const crypto = require("crypto");

// ============================================================
// READ ENVIRONMENT VARIABLES
// ============================================================

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();

let privateKey = process.env.FIREBASE_PRIVATE_KEY;

// ============================================================
// VALIDATE ENVIRONMENT VARIABLES
// ============================================================

console.log("========================================");
console.log("FIREBASE ENV CHECK");
console.log("========================================");

console.log("PROJECT ID:", projectId ? "LOADED" : "MISSING");
console.log("CLIENT EMAIL:", clientEmail ? "LOADED" : "MISSING");
console.log("PRIVATE KEY:", privateKey ? "LOADED" : "MISSING");

console.log("========================================");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Firebase configuration missing. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
  );
}

// ============================================================
// FORMAT FIREBASE PRIVATE KEY
// ============================================================

// Remove accidental surrounding quotation marks
privateKey = privateKey.trim();

if (
  (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
  (privateKey.startsWith("'") && privateKey.endsWith("'"))
) {
  privateKey = privateKey.slice(1, -1);
}

// Convert escaped newline characters into actual newlines
privateKey = privateKey
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n")
  .trim();

// ============================================================
// VALIDATE PRIVATE KEY
// ============================================================

if (
  !privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
  !privateKey.includes("-----END PRIVATE KEY-----")
) {
  throw new Error(
    "Invalid Firebase private key. Check the PEM header and footer in Vercel environment variables."
  );
}

// ============================================================
// VALIDATE PRIVATE KEY CRYPTO FORMAT
// ============================================================

try {
  crypto.createPrivateKey(privateKey);
} catch (error) {
  console.error("FIREBASE PRIVATE KEY FORMAT ERROR:", error.message);

  throw new Error(
    "Firebase private key is not a valid PEM private key. Check your Firebase service account credentials."
  );
}

// ============================================================
// INITIALIZE FIREBASE ADMIN
// ============================================================

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  console.log("========================================");
  console.log("FIREBASE ADMIN INITIALIZED SUCCESSFULLY");
  console.log("PROJECT:", projectId);
  console.log("========================================");

} catch (error) {
  console.error("========================================");
  console.error("FIREBASE INITIALIZATION ERROR");
  console.error(error.message);
  console.error("========================================");

  throw error;
}

// ============================================================
// EXPORT FIREBASE ADMIN
// ============================================================

module.exports = admin;
