import { Router } from 'express';
import {
  getAllUsers,
  getUserProfile,
  updateUserRole,
  createUserByAdmin,
  updateUserByAdmin,
  impersonateUser,
} from '../../services/userService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   GET /api/v1/protected/users/me
 * @desc    Get current authenticated user profile
 * @access  Protected (All authenticated roles)
 */
router.get('/me', async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.user!.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/protected/users
 * @desc    List all system users
 * @access  Protected (Admin only)
 */
router.get('/', authorizeRoles('Admin'), async (req, res, next) => {
  try {
    const users = await getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/protected/users
 * @desc    Create a new user (Admin panel)
 * @access  Protected (Admin only)
 */
router.post('/', authorizeRoles('Admin'), async (req, res, next) => {
  try {
    const { email, password, full_name, role, phone } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Email, password, and full_name are required' });
    }
    const created = await createUserByAdmin({ email, password, full_name, role, phone }, req.user!.id);
    res.status(201).json({ success: true, message: 'User created successfully', data: created });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/v1/protected/users/:id
 * @desc    Update user details (Admin panel)
 * @access  Protected (Admin only)
 */
router.put('/:id', authorizeRoles('Admin'), async (req, res, next) => {
  try {
    const updated = await updateUserByAdmin(req.params.id, req.body, req.user!.id);
    res.json({ success: true, message: 'User profile updated', data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/protected/users/impersonate/:id
 * @desc    Generate a 10-minute temporary account access token (Admin panel)
 * @access  Protected (Admin only)
 */
router.post('/impersonate/:id', authorizeRoles('Admin'), async (req, res, next) => {
  try {
    const result = await impersonateUser(req.params.id, req.user!);
    res.json({ success: true, message: 'Temporary 10-minute session generated', data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/protected/users/:id/role
 * @desc    Update user RBAC role
 * @access  Protected (Admin only)
 */
router.patch('/:id/role', authorizeRoles('Admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ success: false, message: 'Role is required' });
    const updated = await updateUserRole(req.params.id, role, req.user!.id);
    res.json({ success: true, message: 'User role updated', data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
