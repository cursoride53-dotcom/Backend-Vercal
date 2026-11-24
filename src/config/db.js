
"use strict";

const mongoose = require("mongoose");

let connectionPromise = null;

const connectDB = async () => {
  // Support both environment variable names
  const mongoURI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoURI) {
    throw new Error(
      "MONGO_URI or MONGODB_URI is missing from environment variables"
    );
  }

  // Reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Reuse pending connection
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    })
    .then(() => {
      console.log("MongoDB connected successfully");
      return mongoose;
    })
    .catch((error) => {
      connectionPromise = null;

      console.error(
        "MONGODB CONNECTION ERROR:",
        error.message
      );

      throw error;
    });

  return connectionPromise;
};

module.exports = connectDB;
