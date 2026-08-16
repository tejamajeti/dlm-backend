import { Router } from 'express';
import { getOrders, getOrderById, createOrder, updateOrderStatus } from '../../services/orderService';
import { authorizeRoles } from '../../middleware/rbacMiddleware';

const router = Router();

/**
 * @route   GET /api/v1/protected/orders
 * @desc    Get orders (supports filters by status/driver/customer)
 * @access  Protected
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, driver_id, customer_id } = req.query;
    const filters: any = {};
    if (status) filters.status = String(status);
    if (driver_id) filters.driver_id = String(driver_id);
    if (customer_id) filters.customer_id = String(customer_id);

    // Customers only see their own orders unless Admin/Operator
    if (req.user!.role === 'Customer') {
      filters.customer_id = req.user!.id;
    }
    // Drivers only see orders assigned to them unless Admin/Operator
    if (req.user!.role === 'Driver') {
      filters.driver_id = req.user!.id;
    }

    const orders = await getOrders(filters);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/protected/orders/:id
 * @desc    Get order details & package status
 * @access  Protected
 */
router.get('/:id', async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/protected/orders
 * @desc    Dispatch / Create new shipment order
 * @access  Protected (Admin, Warehouse Manager, Customer, Operator)
 */
router.post('/', async (req, res, next) => {
  try {
    const orderData = {
      ...req.body,
      customer_id: req.user!.role === 'Customer' ? req.user!.id : req.body.customer_id,
    };
    const newOrder = await createOrder(orderData);
    res.status(201).json({ success: true, message: 'Order created & event emitted to Kafka', data: newOrder });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/protected/orders/:id/status
 * @desc    Update order workflow status (CREATED -> PACKED -> SHIPPED -> DELIVERED)
 * @access  Protected (Admin, Warehouse Manager, Driver, Operator)
 */
router.patch(
  '/:id/status',
  authorizeRoles('Admin', 'Warehouse Manager', 'Driver', 'Operator'),
  async (req, res, next) => {
    try {
      const { status, current_location } = req.body;
      if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

      const updated = await updateOrderStatus(req.params.id, status, req.user!.id, current_location);
      res.json({ success: true, message: `Order status updated to ${status}`, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
