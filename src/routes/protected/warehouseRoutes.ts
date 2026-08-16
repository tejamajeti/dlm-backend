import { Router } from 'express';
import { getWarehouses, getWarehouseById, createWarehouse, updateWarehouse } from '../../services/warehouseService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   GET /api/v1/protected/warehouses
 * @desc    Get all fulfillment hubs
 * @access  Protected
 */
router.get('/', async (req, res, next) => {
  try {
    const hubs = await getWarehouses();
    res.json({ success: true, data: hubs });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/protected/warehouses/:id
 * @desc    Get warehouse by ID
 * @access  Protected
 */
router.get('/:id', async (req, res, next) => {
  try {
    const hub = await getWarehouseById(req.params.id);
    res.json({ success: true, data: hub });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/protected/warehouses
 * @desc    Provision new warehouse facility
 * @access  Protected (Admin, Warehouse Manager)
 */
router.post('/', authorizeRoles('Admin', 'Warehouse Manager'), async (req, res, next) => {
  try {
    const created = await createWarehouse(req.body);
    res.status(201).json({ success: true, message: 'Warehouse created successfully', data: created });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/v1/protected/warehouses/:id
 * @desc    Update warehouse facility details
 * @access  Protected (Admin, Warehouse Manager)
 */
router.put('/:id', authorizeRoles('Admin', 'Warehouse Manager'), async (req, res, next) => {
  try {
    const updated = await updateWarehouse(req.params.id, req.body);
    res.json({ success: true, message: 'Warehouse facility updated successfully', data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
