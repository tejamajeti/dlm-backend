import { Router } from 'express';
import { getInventory, updateInventoryStock } from '../../services/inventoryService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   GET /api/v1/protected/inventory
 * @desc    Get inventory levels
 * @access  Protected
 */
router.get('/', async (req, res, next) => {
  try {
    const { warehouse_id } = req.query;
    const items = await getInventory(warehouse_id ? String(warehouse_id) : undefined);
    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/protected/inventory/:id/stock
 * @desc    Adjust inventory quantity
 * @access  Protected (Admin, Warehouse Manager)
 */
router.patch('/:id/stock', authorizeRoles('Admin', 'Warehouse Manager'), async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return res.status(400).json({ success: false, message: 'Quantity is required' });

    const updated = await updateInventoryStock(req.params.id, Number(quantity), req.user!.id);
    res.json({ success: true, message: 'Inventory quantity updated', data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
