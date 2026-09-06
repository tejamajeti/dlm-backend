import { Router } from 'express';
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  revokeRefreshToken,
  googleLoginOrRegister,
} from '../../services/authService';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

/**
 * @route   POST /api/v1/public/auth/login
 * @desc    Authenticate user & return access token and refresh token
 * @access  Public
 */
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'Email and password are required' });
    }
    const isRemembered = rememberMe !== undefined ? Boolean(rememberMe) : true;
    const result = await loginUser(email, password, isRemembered);
    res.json({ success: true, message: 'Authentication successful', data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/public/auth/register
 * @desc    Register a new customer account
 * @access  Public
 */
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, full_name, role, phone } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'Email, password, and full_name are required' });
    }
    const result = await registerUser({ email, password, full_name, role, phone });
    res.status(201).json({ success: true, message: 'User registered successfully', data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/public/auth/google
 * @desc    Authenticate or register user via Google OAuth 2.0 Identity Services
 * @access  Public
 */
router.post('/google', authRateLimiter, async (req, res, next) => {
  try {
    const { credential, accessToken, token, role, rememberMe } = req.body;
    if (!credential && !accessToken && !token) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Google credential or accessToken is required',
      });
    }
    const isRemembered = rememberMe !== undefined ? Boolean(rememberMe) : true;
    const result = await googleLoginOrRegister({ credential, accessToken, token, role }, isRemembered);
    
    if (result.isNewUser) {
      return res.json({
        success: true,
        isNewUser: true,
        message: 'Role selection required for new Google account',
        data: result,
      });
    }

    res.json({ success: true, message: 'Google authentication successful', data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/public/auth/refresh
 * @desc    Issue a new short-lived Access Token using a valid Refresh Token
 * @access  Public
 */
router.post('/refresh', authRateLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'refreshToken is required' });
    }
    const result = await refreshAccessToken(refreshToken);
    res.json({ success: true, message: 'Access token refreshed successfully', data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/public/auth/logout
 * @desc    Revoke user refresh token on logout
 * @access  Public
 */
router.post('/logout', authRateLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
