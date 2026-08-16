import { Router } from 'express';
import { getOrderByTracking } from '../../services/orderService';

const router = Router();

/**
 * @route   GET /api/v1/public/tracking/:trackingNumber
 * @desc    Public shipment tracking lookup
 * @access  Public (No JWT required)
 */
router.get('/:trackingNumber', async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;
    const shipment = await getOrderByTracking(trackingNumber);
    res.json({
      success: true,
      message: 'Shipment tracking data retrieved',
      data: shipment,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
