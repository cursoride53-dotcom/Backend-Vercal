"use strict";

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure:
    String(process.env.SMTP_SECURE) === "true",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendLoginOtpEmail = async ({
  email,
  otp,
  name
}) => {
  const mail = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER,

    to: email,

    subject:
      "HRMS Super Admin Login OTP",

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: auto;
        padding: 30px;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
      ">

        <h2 style="margin-bottom: 8px;">
          HRMS Super Admin Login
        </h2>

        <p>
          Hello ${name || "Super Admin"},
        </p>

        <p>
          Your one-time password is:
        </p>

        <div style="
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 8px;
          text-align: center;
          padding: 20px;
          background: #f3f4f6;
          border-radius: 12px;
          margin: 20px 0;
        ">
          ${otp}
        </div>

        <p>
          This OTP expires in
          <strong>5 minutes</strong>.
        </p>

        <p>
          If you did not request this login,
          please ignore this email.
        </p>

        <hr />

        <small>
          HRMS Security System
        </small>

      </div>
    `
  };

  await transporter.sendMail(mail);
};

module.exports = {
  sendLoginOtpEmail
};