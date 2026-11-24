
"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("CORS BLOCKED ORIGIN:", origin);

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "HRMS API is running",
  });
});

// Super Admin authentication
app.use(
  "/api/super-admin/auth",
  require("./routes/superAdminAuthRoutes")
);

// Employee routes
app.use(
  "/api/employee/auth",
  require("./routes/employeeRoutes")
);

app.use(
  "/api/branches",
  require("./routes/branchRoutes")
);


app.use("/api/work-tasks", require("./routes/workTaskRoutes"));




app.use(
  "/api/attendance",
  require("./routes/attendanceRoutes")
);


app.use("/api/leaves", require("./routes/leaveRoutes"));

app.use("/api/payroll", require("./routes/payrollRoutes"));



app.use(
  "/api/employee-advances",
  require("./routes/employeeAdvanceRoutes")
);

app.use(
  "/api/eod-reports",
  require("./routes/eodReportRoutes")
);


app.use(
  "/api/leads",
  require("./routes/leadRoutes")
);
 

// --------------------------------------------------
// OPERATIONAL EXECUTION DESK
// Telecalling, Support Tickets, Installation Ops,
// Transport Fleet
// --------------------------------------------------
app.use(
  "/api/operational-desk",
  require("./routes/operationalDeskRoutes"))


// Register any other existing application routes above this handler.

// 404 handler: must come after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  if (error.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;
