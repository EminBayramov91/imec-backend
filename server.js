require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.ORIGIN || '*';

const app = express();

// Middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ origin: ORIGIN }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { ok: false, error: 'too_many_requests' }
});
app.use(limiter);

// Validation function
const validateBody = ({ name, email, phone, interest, message }) => {
    if (!name || name.trim().length < 2) return { ok: false, field: 'name', message: 'Name must be at least 2 characters' };
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email.trim())) return { ok: false, field: 'email', message: 'Invalid email format' };
    const phoneRe = /^\+\d{1,3}[0-9]{7,}$/;
    if (!phone || !phoneRe.test(phone.trim())) return { ok: false, field: 'phone', message: 'Phone must be in international format (e.g., +1234567890)' };
    if (!interest || interest.trim() === '') return { ok: false, field: 'interest', message: 'Interest is required' };
    if (!message || message.trim().length < 10) return { ok: false, field: 'message', message: 'Message must be at least 10 characters' };
    return { ok: true };
};

let transporter;
let isTestAccount = false;

// Mailer initialization
async function initMailer() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: (process.env.SMTP_SECURE === 'true'),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });
        await transporter.verify();
        console.log('✅ SMTP transporter ready (production)');
    } else {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        isTestAccount = true;
        console.log('⚠️ Using Ethereal test account. Preview URLs will be available for sent emails.');
    }
}

// ==================== ROUTES ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'imec-backend',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Server info endpoint
app.get('/api/info', (req, res) => {
    res.json({
        ok: true,
        message: 'IMEC Backend API Server',
        version: '1.0.0',
        endpoints: {
            contact: 'POST /api/contact',
            health: 'GET /api/health',
            info: 'GET /api/info'
        },
        mailer: isTestAccount ? 'test' : 'production'
    });
});

// Contact form GET endpoint (for testing)
app.get('/api/contact', (req, res) => {
    res.json({
        ok: true,
        message: 'Contact API is working! Use POST method to submit contact form.',
        required_fields: {
            name: 'string (min 2 chars)',
            email: 'valid email',
            phone: 'international format (e.g., +1234567890)',
            interest: 'string',
            message: 'string (min 10 chars)'
        },
        example: {
            name: "John Doe",
            email: "john@example.com",
            phone: "+1234567890",
            interest: "Course Information",
            message: "I'm interested in learning more about your courses"
        }
    });
});

// Main contact form POST endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, interest, message } = req.body;

        // Validation
        const v = validateBody({ name, email, phone, interest, message });
        if (!v.ok) {
            return res.status(400).json({
                ok: false,
                error: 'validation_failed',
                field: v.field,
                message: v.message
            });
        }

        // Email content
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
                        ${message.replace(/\n/g, '<br>')}
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
            from: process.env.SMTP_FROM || (process.env.SMTP_USER || 'no-reply@imec-school.com'),
            to: process.env.TO_EMAIL || process.env.SMTP_USER || 'imec@imec-school.com',
            subject: `New Contact from IMEC Website - ${name}`,
            html,
            text
        };

        const info = await transporter.sendMail(mailOptions);
        const previewUrl = isTestAccount ? nodemailer.getTestMessageUrl(info) : null;

        console.log(`✅ Contact form submitted: ${name} <${email}>`);

        return res.json({
            ok: true,
            message: 'Email sent successfully',
            previewUrl,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Send mail error:', err);
        return res.status(500).json({
            ok: false,
            error: 'internal_server_error',
            message: 'Failed to send email. Please try again later.'
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        ok: true,
        message: '🚀 IMEC Backend Server is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        documentation: {
            contact: 'POST /api/contact',
            health: 'GET /api/health',
            info: 'GET /api/info'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        error: 'endpoint_not_found',
        message: 'Requested endpoint does not exist',
        available_endpoints: {
            'GET /': 'Server information',
            'GET /api/health': 'Health check',
            'GET /api/info': 'Server info',
            'GET /api/contact': 'Contact API info',
            'POST /api/contact': 'Submit contact form'
        }
    });
});


// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        ok: false,
        error: 'internal_server_error',
        message: 'Something went wrong on the server'
    });
});

// ==================== SERVER STARTUP ====================

// Initialize mailer and start server
initMailer()
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on port ${PORT} (accessible from outside)`);
            console.log(`📧 Mailer mode: ${isTestAccount ? 'TEST (Ethereal)' : 'PRODUCTION'}`);
            console.log(`🌐 CORS origin: ${ORIGIN}`);
            console.log(`⏰ Started at: ${new Date().toISOString()}`);
        });
    })
    .catch((err) => {
        console.error('❌ Mailer init failed:', err);
        process.exit(1);
    });

module.exports = app;