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
    }
  });
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, interest, message, language } = req.body;

    const v = validateBody({ name, email, phone, interest, message });
    if (!v.ok) {
      return res.status(400).json({
        ok: false,
        error: "validation_failed",
        field: v.field,
        message: v.message,
      });
    }

    let subject, greeting, body, closing;

    switch (language) {
      case "az":
        subject = "IMEC ilə əlaqə saxladığınız üçün təşəkkürlər!";
        greeting = `Hörmətli <b style="color: #2b5dff;">${name}</b>,`;
        body = `
      <p>Bizim <b style="color: #2b5dff;">${interest}</b> dərsimizə maraq göstərdiyiniz üçün təşəkkür edirik.</p>
      <p>Aşağıda bu dərs haqqında daha ətraflı məlumat verilmişdir:</p>
      <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #1D2943; margin: 15px 0;">
        <p><strong style="color: #1D2943;">Sınaq dərsi:</strong> Sınaq dərsinizi təyin etmək üçün bizimlə əlaqə saxlayın.</p>
        <p><strong style="color: #1D2943;">Fərdi dərslər:</strong> 8 dərs — 250 AZN</p>
        <p><strong style="color: #1D2943;">Qrup dərsləri:</strong> 8 dərs — 200 AZN</p>
        <p><strong style="color: #1D2943;">Dərsin müddəti:</strong> Hər dərs 50 dəqiqə</p>
        <p><strong style="color: #1D2943;">Əlaqə:</strong> <a href="tel:+994103192021" style="color: #1D2943;">+994103192021</a> (Zəng və ya WhatsApp)</p>
      </div>`;
        closing = `
      <p>Hörmətlə,<br><b style="color: #1D2943;">IMEC komandası</b><br>
      <a href="https://imec-school.com" style="color: #1D2943;">imec-school.com</a></p>`;
        break;

      case "ru":
        subject = "Спасибо за обращение в IMEC!";
        greeting = `Уважаемый(ая) <b style="color: #2b5dff;">${name}</b>,`;
        body = `
      <p>Спасибо за ваш интерес к нашему курсу <b style="color: #2b5dff;">${interest}</b>.</p>
      <p>Вот подробная информация о занятиях:</p>
      <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #1D2943; margin: 15px 0;">
        <p><strong style="color: #1D2943;">Пробное занятие:</strong> Свяжитесь с нами, чтобы записаться на пробный урок.</p>
        <p><strong style="color: #1D2943;">Индивидуальные занятия:</strong> 8 уроков — 250 AZN</p>
        <p><strong style="color: #1D2943;">Групповые занятия:</strong> 8 уроков — 200 AZN</p>
        <p><strong style="color: #1D2943;">Длительность занятия:</strong> 50 минут</p>
        <p><strong style="color: #1D2943;">Контакты:</strong> <a href="tel:+994103192021" style="color: #1D2943;">+994103192021</a> (Звонок или WhatsApp)</p>
      </div>`;
        closing = `
      <p>С уважением,<br><b style="color: #1D2943;">Команда IMEC</b><br>
      <a href="https://imec-school.com" style="color: #1D2943;">imec-school.com</a></p>`;
        break;

      default: // English
        subject = "Thank you for contacting IMEC!";
        greeting = `Dear <b style="color: #2b5dff;">${name}</b>,`;
        body = `
      <p>Thank you for your interest in our <b style="color: #2b5dff;">${interest}</b> program.</p>
      <p>Here is some more detailed information:</p>
      <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #1D2943; margin: 15px 0;">
        <p><strong style="color: #1D2943;">Trial Lesson:</strong> Contact us to schedule your trial lesson.</p>
        <p><strong style="color: #1D2943;">Individual Lessons:</strong> 8 lessons — 250 AZN</p>
        <p><strong style="color: #1D2943;">Group Lessons:</strong> 8 lessons — 200 AZN</p>
        <p><strong style="color: #1D2943;">Lesson Duration:</strong> 50 minutes per lesson</p>
        <p><strong style="color: #1D2943;">Contact Us:</strong> <a href="tel:+994103192021" style="color: #1D2943;">+994103192021</a> (Call or WhatsApp)</p>
      </div>`;
        closing = `
      <p>Best regards,<br><b style="color: #1D2943;">IMEC Team</b><br>
      <a href="https://imec-school.com" style="color: #1D2943;">imec-school.com</a></p>`;
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
Message: ${message}

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

    const info = await transporter.sendMail(mailOptions);

    const autoReplyOptions = {
      from: `"IMEC" <${process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@imec-school.com"}>`,
      to: email,
      subject: subject,
      html: `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
    <div style="background: #1D2943; padding: 30px; text-align: center; color: white;">
      <h1 style="margin: 0; font-size: 28px;">IMEC</h1>
      <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">${subject}</p>
    </div>
    <div style="padding: 30px; background: #f9f9f9; color: #000000;">
      ${greeting}
      ${body}
      ${closing}
    </div>
    <div style="background: #1D2943; color: white; padding: 20px; text-align: center; font-size: 12px;">
      <p>This is an automated response. Please do not reply.</p>
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