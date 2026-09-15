const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Brute-force protection: Max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please wait 15 minutes before trying again.'
  }
});

// OTP generation limiter: Max 5 OTP requests per 10 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait 10 minutes before requesting a new code.'
  }
});

// Registration limiter: Max 5 accounts per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many accounts registered from this IP. Please try again later.'
  }
});

// Public routes
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/send-otp', otpLimiter, authController.sendOtp);
router.post('/verify-otp', loginLimiter, authController.verifyOtp);
router.post('/direct-login', authController.directLogin);
router.post('/google', authController.googleLogin);
router.get('/google/login', authController.googleOAuthRedirect);
router.get('/google/callback', authController.googleOAuthCallback);

// Protected routes
router.get('/me', authenticate, authController.getProfile);
router.put('/me', authenticate, authController.updateProfile);
router.post('/random-avatar', authenticate, authController.randomizeAvatar);

module.exports = router;
