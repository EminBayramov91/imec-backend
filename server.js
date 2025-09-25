require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;

const app = express();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - разрешаем ваш домен
app.use(cors({
  origin: [
    'https://imec-school.com',
    'https://www.imec-school.com',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'IMEC Backend is running' });
});

// Валидация (УБИРАЕМ проверку message - она не обязательна)
const validateBody = ({ name, email, phone, interest }) => {
  if (!name || name.trim().length < 3) return { ok: false, field: "name" };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email.trim())) return { ok: false, field: "email" };
  const phoneRe = /^\+\d{1,3}[0-9]{7,}$/;
  if (!phone || !phoneRe.test(phone.trim())) return { ok: false, field: "phone" };
  if (!interest || interest.trim() === "") return { ok: false, field: "interest" };
  return { ok: true };
};

let transporter;

async function initMailer() {
  console.log('Initializing mail transporter...');

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      await transporter.verify();
      console.log('✅ SMTP transporter ready (production)');
      console.log('SMTP Config:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER
      });
    } catch (error) {
      console.error('❌ SMTP verification failed:', error);
      throw error;
    }
  } else {
    console.log('❌ No SMTP credentials found');
    throw new Error('SMTP credentials not configured');
  }
}

// Contact form endpoint
app.post("/contacts/", async (req, res) => {
  try {
    console.log('Received contact form data:', req.body);

    const { name, email, phone, interest, message } = req.body;

    // Валидация (message не обязателен)
    const v = validateBody({ name, email, phone, interest });
    if (!v.ok) {
      return res.status(400).json({
        ok: false,
        error: "validation_failed",
        field: v.field
      });
    }

    // HTML письма
    const html = `
            <h3>New contact form submission from IMEC School</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Interest:</strong> ${interest}</p>
            <p><strong>Message:</strong> ${message || 'No message provided'}</p>
            <hr>
            <p><small>Sent from IMEC School website</small></p>
        `;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.TO_EMAIL || process.env.SMTP_USER,
      subject: `New Contact Form - ${name}`,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully');

    return res.json({
      ok: true,
      message: "Email sent successfully"
    });

  } catch (err) {
    console.error("❌ Send mail error:", err);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: "Failed to send email"
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize and start server
initMailer()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 Health check: /health`);
      });
    })
    .catch((err) => {
      console.error("❌ Mailer init failed:", err);
      process.exit(1);
    });