"use strict";

const mongoose = require("mongoose");

let connectionPromise;

const connectDB = async () => {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MongoDB URI missing");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    }).catch(error => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
};

module.exports = connectDB;