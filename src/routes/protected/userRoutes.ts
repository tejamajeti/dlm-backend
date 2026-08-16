import { Router } from 'express';
import { getAllUsers, getUserProfile, updateUserRole } from '../../services/userService';
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
