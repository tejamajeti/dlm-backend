import { findMany } from '../db/crudHelper';

export async function getDashboardMetrics() {
  const users = await findMany('users');
  const warehouses = await findMany('warehouses');
  const orders = await findMany('orders');
  const inventory = await findMany('inventory');
  const auditLogs = await findMany('audit_logs', {}, { orderBy: 'created_at DESC', limit: 20 });

  const activeOrders = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return {
    overview: {
      totalUsers: users.length,
      totalWarehouses: warehouses.length,
      totalOrders: orders.length,
      activeShipments: activeOrders.length,
      deliveredShipments: deliveredOrders.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    },
    activeOrders: orders.slice(0, 10),
    recentAuditLogs: auditLogs,
  };
}
