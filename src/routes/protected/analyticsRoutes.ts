import { Router } from 'express';
import { getDashboardMetrics } from '../../services/analyticsService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   GET /api/v1/protected/analytics/dashboard
 * @desc    Get executive metrics & audit stream
 * @access  Protected (Admin, Warehouse Manager, Operator)
 */
router.get(
  '/dashboard',
  authorizeRoles('Admin', 'Warehouse Manager', 'Operator'),
  async (req, res, next) => {
    try {
      const data = await getDashboardMetrics();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
