

"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/operationalDeskController");

const {
  firebaseAuthMiddleware,
  requireSuperAdmin,
} = require("../middleware/firebaseAuthMiddleware");

const {
  employeeAuthMiddleware,
  requireEmployee,
  requireOperationalAccess,
} = require("../middleware/employeeAuthMiddleware");

// ------------------------------------------------------------
// Validate middleware and controller exports at startup
// ------------------------------------------------------------
const requiredHandlers = {
  firebaseAuthMiddleware,
  requireSuperAdmin,
  employeeAuthMiddleware,
  requireEmployee,
  requireOperationalAccess,
};

for (const [name, handler] of Object.entries(requiredHandlers)) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Operational desk: ${name} is not a function. Check its module export.`
    );
  }
}

const controllerHandlers = [
  "getDashboard",
  "listRecords",
  "getRecordHistory",
  "signOffInstallation",
  "getRecord",
  "createRecord",
  "updateRecord",
  "deleteRecord",
];

for (const name of controllerHandlers) {
  if (typeof controller[name] !== "function") {
    throw new TypeError(
      `Operational desk: controller.${name} is not a function. Check operationalDeskController.js.`
    );
  }
}

// ------------------------------------------------------------
// SUPER ADMIN ROUTES
// Base URL: /api/operational-desk/admin
// ------------------------------------------------------------
const adminRouter = express.Router();

adminRouter.use(firebaseAuthMiddleware);
adminRouter.use(requireSuperAdmin);

adminRouter.get("/dashboard", controller.getDashboard);

adminRouter.get(
  "/:resource/:id/history",
  controller.getRecordHistory
);

adminRouter.post(
  "/installations/:id/sign-off",
  controller.signOffInstallation
);

adminRouter.get("/:resource", controller.listRecords);
adminRouter.get("/:resource/:id", controller.getRecord);
adminRouter.post("/:resource", controller.createRecord);
adminRouter.patch("/:resource/:id", controller.updateRecord);
adminRouter.delete("/:resource/:id", controller.deleteRecord);

router.use("/admin", adminRouter);

// ------------------------------------------------------------
// EMPLOYEE AND BRANCH MANAGER ROUTES
// Base URL: /api/operational-desk/employee
// ------------------------------------------------------------
const employeeRouter = express.Router();

employeeRouter.use(employeeAuthMiddleware);
employeeRouter.use(requireEmployee);
employeeRouter.use(requireOperationalAccess);

employeeRouter.get(
  "/:resource/:id/history",
  controller.getRecordHistory
);

employeeRouter.get("/:resource", controller.listRecords);
employeeRouter.get("/:resource/:id", controller.getRecord);
employeeRouter.post("/:resource", controller.createRecord);
employeeRouter.patch("/:resource/:id", controller.updateRecord);

router.use("/employee", employeeRouter);

module.exports = router;
