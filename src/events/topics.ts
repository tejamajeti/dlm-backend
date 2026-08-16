export const KAFKA_TOPICS = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PACKED: 'order.packed',
  PACKAGE_SHIPPED: 'package.shipped',
  PACKAGE_DELIVERED: 'package.delivered',
  INVENTORY_UPDATED: 'inventory.updated',
  WAREHOUSE_CREATED: 'warehouse.created',
  DRIVER_LOCATION_UPDATED: 'driver.location.updated',
  NOTIFICATION_SEND: 'notification.send',
  ANALYTICS_EVENTS: 'analytics.events',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
} as const;

export type KafkaTopicKey = keyof typeof KAFKA_TOPICS;
export type KafkaTopicValue = (typeof KAFKA_TOPICS)[KafkaTopicKey];
