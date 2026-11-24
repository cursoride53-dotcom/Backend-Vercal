
"use strict";

const app = require("./src/app");
const connectDB = require("./src/config/db");

const handler = async (req, res) => {
  try {
    // Connect MongoDB before handling the request
    await connectDB();

    // Forward request to Express
    return app(req, res);

  } catch (error) {
    console.error("VERCEL BACKEND ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Backend initialization failed"
      });
    }
  }
};

module.exports = handler;
