import { Router } from 'express';
import { getUserNotifications, markNotificationAsRead, sendNotification } from '../../services/notificationService';

const router = Router();

/**
 * @route   GET /api/v1/protected/notifications
 * @desc    Get current user notifications
 * @access  Protected
 */
router.get('/', async (req, res, next) => {
  try {
    const list = await getUserNotifications(req.user!.id);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/protected/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Protected
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const updated = await markNotificationAsRead(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/protected/notifications
 * @desc    Send alert notification to a user
 * @access  Protected (Admin, Warehouse Manager)
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, title, message, type } = req.body;
    const created = await sendNotification(userId || req.user!.id, title, message, type);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

export default router;
