import { findMany, findById, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';

export async function getOrders(filters: { status?: string; customer_id?: string; driver_id?: string } = {}) {
  return await findMany('orders', filters, { orderBy: 'created_at DESC' });
}

export async function getOrderById(id: string) {
  const order = await findById('orders', id);
  if (!order) throw { statusCode: 404, message: 'Order not found' };
  const packages = await findMany('packages', { order_id: id });
  return { ...order, packages };
}

/**
 * Cache-Aside Pattern:
 * 1. Check Redis cache for 'tracking:<trackingNumber>'
 * 2. Cache Hit -> Return cached payload directly
 * 3. Cache Miss -> Query Database -> Store payload in Redis with 300s TTL -> Return result
 */
export async function getOrderByTracking(trackingNumber: string) {
  const cacheKey = `tracking:${trackingNumber}`;
  
  // 1. Check Redis Cache first
  const cachedData = await cacheGet(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // 2. Fallback to Database Query on Cache Miss
  const orders = await findMany('orders', { tracking_number: trackingNumber });
  if (orders.length === 0) throw { statusCode: 404, message: 'Shipment with this tracking number not found' };
  const order = orders[0];
  const packages = await findMany('packages', { order_id: order.id });
  const result = { ...order, packages };

  // 3. Store result in Redis Cache with 5 minute TTL (300s)
  await cacheSet(cacheKey, result, 300);

  return result;
}

export async function createOrder(data: {
  customer_id?: string;
  origin_warehouse_id: string;
  destination_address: string;
  destination_city: string;
  destination_zip: string;
  total_amount: number;
  currency?: string;
  driver_id?: string;
}) {
  const trackingNumber = `DLM-${Math.floor(100000 + Math.random() * 900000)}-US`;
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  const newOrder = {
    id: orderId,
    tracking_number: trackingNumber,
    customer_id: data.customer_id || null,
    origin_warehouse_id: data.origin_warehouse_id,
    destination_address: data.destination_address,
    destination_city: data.destination_city,
    destination_zip: data.destination_zip,
    status: 'CREATED',
    total_amount: data.total_amount || 0.0,
    currency: data.currency || 'USD',
    driver_id: data.driver_id || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const createdOrder = await insert('orders', newOrder);

  // Automatically create accompanying package record
  const packageCode = `PKG-${createdOrder.tracking_number}`;
  const newPkg = {
    id: `pkg_${Date.now()}`,
    order_id: createdOrder.id,
    package_code: packageCode,
    weight_kg: 5.0,
    dimensions: '30x20x15 cm',
    current_location: 'Origin Warehouse Dispatch Center',
    status: 'PREPARING',
  };
  await insert('packages', newPkg);

  await publishEvent(KAFKA_TOPICS.ORDER_CREATED, {
    orderId: createdOrder.id,
    trackingNumber: createdOrder.tracking_number,
    totalAmount: createdOrder.total_amount,
    currency: createdOrder.currency,
  });

  return { ...createdOrder, packages: [newPkg] };
}

export async function updateOrderStatus(orderId: string, status: string, actorId: string, currentLocation?: string) {
  const validStatuses = ['CREATED', 'PROCESSING', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    throw { statusCode: 400, message: `Invalid order status. Allowed: ${validStatuses.join(', ')}` };
  }

  const updatedOrder = await update('orders', orderId, { status });
  if (!updatedOrder) throw { statusCode: 404, message: 'Order not found' };

  if (currentLocation) {
    const pkgs = await findMany('packages', { order_id: orderId });
    if (pkgs.length > 0) {
      await update('packages', pkgs[0].id, { current_location: currentLocation, status });
    }
  }

  // Invalidate tracking cache in Redis on status update
  await cacheDel(`tracking:${updatedOrder.tracking_number}`);

  // Publish corresponding Kafka Topic based on status
  let topic: string = KAFKA_TOPICS.ORDER_PACKED;
  if (status === 'SHIPPED' || status === 'IN_TRANSIT') topic = KAFKA_TOPICS.PACKAGE_SHIPPED;
  if (status === 'DELIVERED') topic = KAFKA_TOPICS.PACKAGE_DELIVERED;
  if (status === 'CANCELLED') topic = KAFKA_TOPICS.ORDER_CANCELLED;

  await publishEvent(topic, {
    orderId,
    trackingNumber: updatedOrder.tracking_number,
    status,
    actorId,
  });

  return updatedOrder;
}
