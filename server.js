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


app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: ORIGIN }));


const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
});
app.use(limiter);


const validateBody = ({ name, email, phone, interest, message }) => {
    if (!name || name.trim().length < 3) return { ok: false, field: 'name' };
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email.trim())) return { ok: false, field: 'email' };
    const phoneRe = /^\+\d{1,3}[0-9]{7,}$/;
    if (!phone || !phoneRe.test(phone.trim())) return { ok: false, field: 'phone' };
    if (!interest || interest.trim() === '') return { ok: false, field: 'interest' };
    if (!message || message.trim() === '') return { ok: false, field: 'message' };
    return { ok: true };
};

let transporter;
let isTestAccount = false;

async function initMailer() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: (process.env.SMTP_SECURE === 'true'),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
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


app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, interest, message } = req.body;
        const v = validateBody({ name, email, phone, interest, message });
        if (!v.ok) return res.status(400).json({ ok: false, error: 'validation_failed', field: v.field });

        const html = `
      <h3>New contact form submission</h3>
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Phone:</b> ${phone}</p>
      <p><b>Interest:</b> ${interest}</p>
      <p><b>Message:</b> ${message}</p>
    `;

        const mailOptions = {
            from: process.env.SMTP_FROM || (process.env.SMTP_USER || 'no-reply@example.com'),
            to: process.env.TO_EMAIL || process.env.SMTP_USER || 'test@ethereal.email',
            subject: `New contact from website — ${name}`,
            html
        };

        const info = await transporter.sendMail(mailOptions);

        const previewUrl = isTestAccount ? nodemailer.getTestMessageUrl(info) : null;

        return res.json({ ok: true, message: 'Email sent', previewUrl });
    } catch (err) {
        console.error('Send mail error:', err);
        return res.status(500).json({ ok: false, error: 'internal' });
    }
});

// if (process.env.NODE_ENV === 'production') {
//     const clientDist = path.join(__dirname, 'client', 'dist');
//     app.use(express.static(clientDist));
//     app.use((req, res) => res.sendFile(path.join(clientDist, 'index.html')));
// }

initMailer()
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on port ${PORT} (accessible from outside)`);
        });
    })
    .catch((err) => {
        console.error('Mailer init failed:', err);
        process.exit(1);
    });