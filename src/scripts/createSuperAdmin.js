"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const SuperAdmin =
  require(
    "../src/models/SuperAdmin"
  );

const connectDB =
  require(
    "../src/config/db"
  );

const createSuperAdmin =
  async () => {
    try {
      await connectDB();

      const email =
        "admin@yourcompany.com";

      const existing =
        await SuperAdmin.findOne({
          email
        });

      if (existing) {
        console.log(
          "Super Admin already exists"
        );

        process.exit(0);
      }

      const admin =
        await SuperAdmin.create({
          name: "System Super Admin",
          email,
          role: "SUPER_ADMIN",
          status: "ACTIVE"
        });

      console.log(
        "Super Admin created:"
      );

      console.log({
        id: admin._id,
        email: admin.email,
        role: admin.role,
        status: admin.status
      });

      await mongoose.connection.close();

      process.exit(0);

    } catch (error) {
      console.error(
        "CREATE SUPER ADMIN ERROR:",
        error
      );

      process.exit(1);
    }
  };

createSuperAdmin();