const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Fail fast if JWT secret is too weak
const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or too short (minimum 32 characters). Set a strong random secret in .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Required for Render/Heroku

app.use(helmet());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
const rateLimit = require('express-rate-limit');
const { csrfProtect } = require('./middleware/auth');

// Apply CSRF protection to all mutating requests except login/logout (which create/destroy the token)
app.use((req, res, next) => {
  const exempt = ['/api/auth/login', '/api/auth/logout'];
  if (exempt.includes(req.path)) return next();
  csrfProtect(req, res, next);
});

// Strict limit on auth routes — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.use('/api/documents', require('./routes/documents'));
app.use('/api/users', require('./routes/users'));
app.use('/api/franchises', require('./routes/franchises'));
app.use('/api/employee-documents', require('./routes/employeeDocuments'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/notifications', require('./routes/notifications'));





