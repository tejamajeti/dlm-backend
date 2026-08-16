import { Router } from 'express';
import { loginUser, registerUser } from '../../services/authService';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

/**
 * @route   POST /api/v1/public/auth/login
 * @desc    Authenticate user & return JWT token
 * @access  Public
 */
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Validation Error', message: 'Email and password are required' });
    }
    const result = await loginUser(email, password);
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

export default router;
