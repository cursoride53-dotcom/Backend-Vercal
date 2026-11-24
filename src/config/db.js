"use strict";

const mongoose = require("mongoose");

let connectionPromise = null;

const connectDB = async () => {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MongoDB URI missing");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000
  })
  .then(() => {
    console.log("MongoDB connected successfully");
    return mongoose;
  })
  .catch(error => {
    connectionPromise = null;
    throw error;
  });

  return connectionPromise;
};

module.exports = connectDB;