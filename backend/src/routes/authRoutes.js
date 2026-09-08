const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/direct-login', authController.directLogin);
router.post('/google', authController.googleLogin);
router.get('/google/login', authController.googleOAuthRedirect);
router.get('/google/callback', authController.googleOAuthCallback);

// Protected routes
router.get('/me', authenticate, authController.getProfile);
router.put('/me', authenticate, authController.updateProfile);
router.post('/random-avatar', authenticate, authController.randomizeAvatar);

module.exports = router;
