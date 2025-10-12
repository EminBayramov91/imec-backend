require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.ORIGIN || "*";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors({ origin: ORIGIN }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { ok: false, error: "too_many_requests" },
});
app.use(limiter);

const validateBody = ({ name, email, phone, interest, message }) => {
  if (!name || name.trim().length < 2)
    return {
      ok: false,
      field: "name",
      message: "Name must be at least 2 characters",
    };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email.trim()))
    return { ok: false, field: "email", message: "Invalid email format" };
  const phoneRe = /^\+\d{1,3}[0-9]{7,}$/;
  if (!phone || !phoneRe.test(phone.trim()))
    return {
      ok: false,
      field: "phone",
      message: "Phone must be in international format (e.g., +1234567890)",
    };
  if (!interest || interest.trim() === "")
    return { ok: false, field: "interest", message: "Interest is required" };
  return { ok: true };
};

let transporter;
let isTestAccount = false;

async function initMailer() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    await transporter.verify();
    console.log("✅ SMTP transporter ready (production)");
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    isTestAccount = true;
    console.log(
        "⚠️ Using Ethereal test account. Preview URLs will be available for sent emails."
    );
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "imec-backend",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/info", (req, res) => {
  res.json({
    ok: true,
    message: "IMEC Backend API Server",
    version: "1.0.0",
    endpoints: {
      contact: "POST /api/contact",
      health: "GET /api/health",
      info: "GET /api/info",
    },
    mailer: isTestAccount ? "test" : "production",
  });
});

app.get("/api/contact", (req, res) => {
  res.json({
    ok: true,
    message: "Contact API is working! Use POST method to submit contact form.",
    required_fields: {
      name: "string (min 2 chars)",
      email: "valid email",
      phone: "international format (e.g., +1234567890)",
      interest: "string",
      message: "string (min 10 chars)",
    },
    example: {
      name: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
      interest: "Course Information",
      message: "I'm interested in learning more about your courses",
    },
  });
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, interest, message } = req.body;

    const v = validateBody({ name, email, phone, interest, message });
    if (!v.ok) {
      return res.status(400).json({
        ok: false,
        error: "validation_failed",
        field: v.field,
        message: v.message,
      });
    }

    const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">
                    New Contact Form Submission
                </h2>
                <div style="background: #f9f9f9; padding: 20px; border-radius: 5px;">
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone}</p>
                    <p><strong>Interest:</strong> ${interest}</p>
                    <p><strong>Message:</strong></p>
                    <div style="background: white; padding: 15px; border-radius: 3px; border-left: 4px solid #007cba;">
                        ${message.replace(/\n/g, "<br>")}
                    </div>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">
                    This message was sent from the IMEC School website contact form.
                </p>
            </div>
        `;

    const text = `
New Contact Form Submission

Name: ${name}
Email: ${email}
Phone: ${phone}
Interest: ${interest}

Message:
${message}

---
Sent from IMEC School website
        `;

    const mailOptions = {
      from:
          process.env.SMTP_FROM ||
          process.env.SMTP_USER ||
          "no-reply@imec-school.com",
      to:
          process.env.TO_EMAIL || process.env.SMTP_USER || "imec@imec-school.com",
      subject: `New Contact from IMEC Website - ${name}`,
      html,
      text,
    };

    // Отправляем основное письмо администратору
    const info = await transporter.sendMail(mailOptions);

    // Отправляем автоответ пользователю
    const autoReplyOptions = {
      from: `"IMEC" <${process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@imec-school.com"}>`,
      to: email,
      subject: "Thank you for contacting IMEC!",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #007cba, #2b5dff); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Thank You!</h1>
            <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">We have received your message</p>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p>Dear <b style="color: #2b5dff;">${name}</b>,</p>
            <p>Thank you for reaching out and for your interest in our <b style="color: #2b5dff;">${interest}</b> program.</p>
            <p>We have received your message and our team will review it carefully. We'll get back to you as soon as possible, usually within 24-48 hours.</p>
            <br>
            <p>Here's a summary of your inquiry:</p>
            <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #2b5dff; margin: 15px 0;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Interest:</strong> ${interest}</p>
              <p><strong>Your Message:</strong></p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 3px; margin-top: 10px;">
                ${message.replace(/\n/g, "<br>")}
              </div>
            </div>
            <p>If you have any urgent questions, feel free to reply to this email.</p>
            <br>
            <p>Best regards,</p>
            <p><b style="color: #2b5dff;">IMEC Team</b><br>
            <a href="https://imec-school.com" style="color: #2b5dff; text-decoration: none;">imec-school.com</a></p>
          </div>
          <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
            <p>This is an automated response. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} IMEC School. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    const autoReplyInfo = await transporter.sendMail(autoReplyOptions);
    const previewUrl = isTestAccount
        ? nodemailer.getTestMessageUrl(info)
        : null;
    const autoReplyPreviewUrl = isTestAccount
        ? nodemailer.getTestMessageUrl(autoReplyInfo)
        : null;

    console.log(`✅ Contact form submitted: ${name} <${email}>`);
    console.log(`✅ Auto-reply sent to: ${email}`);

    return res.json({
      ok: true,
      message: "Email sent successfully",
      previewUrl,
      autoReplyPreviewUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Send mail error:", err);
    return res.status(500).json({
      ok: false,
      error: "internal_server_error",
      message: "Failed to send email. Please try again later.",
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "🚀 IMEC Backend Server is running!",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    documentation: {
      contact: "POST /api/contact",
      health: "GET /api/health",
      info: "GET /api/info",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "endpoint_not_found",
    message: "Requested endpoint does not exist",
    available_endpoints: {
      "GET /": "Server information",
      "GET /api/health": "Health check",
      "GET /api/info": "Server info",
      "GET /api/contact": "Contact API info",
      "POST /api/contact": "Submit contact form",
    },
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({
    ok: false,
    error: "internal_server_error",
    message: "Something went wrong on the server",
  });
});

initMailer()
    .then(() => {
      app.listen(PORT, "127.0.0.1", () => {
        console.log(
            `🚀 Server running on port ${PORT} (accessible from outside)`
        );
        console.log(
            `📧 Mailer mode: ${isTestAccount ? "TEST (Ethereal)" : "PRODUCTION"}`
        );
        console.log(`🌐 CORS origin: ${ORIGIN}`);
        console.log(`⏰ Started at: ${new Date().toISOString()}`);
      });
    })
    .catch((err) => {
      console.error("❌ Mailer init failed:", err);
      process.exit(1);
    });

module.exports = app;