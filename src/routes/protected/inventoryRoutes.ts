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
 * @desc    Adjust inventory quantity and reorder threshold level
 * @access  Protected (Admin, Warehouse Manager)
 */
router.patch('/:id/stock', authorizeRoles('Admin', 'Warehouse Manager'), async (req, res, next) => {
  try {
    const { quantity, reorder_level } = req.body;
    const updateData: { quantity?: number; reorder_level?: number } = {};
    if (quantity !== undefined) updateData.quantity = Number(quantity);
    if (reorder_level !== undefined) updateData.reorder_level = Number(reorder_level);

    const updated = await updateInventoryStock(req.params.id, updateData, req.user!.id);
    res.json({ success: true, message: 'Inventory updated successfully', data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
