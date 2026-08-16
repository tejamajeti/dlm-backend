import { Router } from 'express';
import { updateDriverLocation, getDriverLatestLocation } from '../../services/trackingService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   POST /api/v1/protected/tracking/telemetry
 * @desc    Submit driver GPS location stream
 * @access  Protected (Driver, Admin)
 */
router.post('/telemetry', authorizeRoles('Driver', 'Admin'), async (req, res, next) => {
  try {
    const { latitude, longitude, speed_kmh, heading } = req.body;
    const driverId = req.user!.role === 'Driver' ? req.user!.id : req.body.driver_id;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const recorded = await updateDriverLocation({
      driver_id: driverId,
      latitude,
      longitude,
      speed_kmh,
      heading,
    });

    res.status(201).json({ success: true, message: 'Telemetry recorded', data: recorded });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/protected/tracking/driver/:driverId
 * @desc    Get latest GPS position of a driver
 * @access  Protected
 */
router.get('/driver/:driverId', async (req, res, next) => {
  try {
    const location = await getDriverLatestLocation(req.params.driverId);
    res.json({ success: true, data: location });
  } catch (err) {
    next(err);
  }
});

export default router;
