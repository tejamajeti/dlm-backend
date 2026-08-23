import { subscribeEvent } from '../eventBus';
import { KAFKA_TOPICS } from '../topics';
import { KafkaEventPayload } from '../../types';
import {
  emitToDashboard,
  emitToUser,
  emitToRole,
  emitToShipment,
} from '../../websocket/socketServer';

type EventHandler = (payload: KafkaEventPayload) => void;

/**
 * Event-to-Socket Routing Dictionary
 * Clean, declarative translation layer mapping Kafka/EventBus domain events
 * directly to target Socket.IO rooms and frontend payload structures.
 */
const eventHandlers: Record<string, EventHandler> = {

  // 1. ORDER CREATION
  [KAFKA_TOPICS.ORDER_CREATED]: (payload) => {
    const data = payload.data;
    emitToDashboard('order:created', data);
    emitToRole('Warehouse Manager', 'notification:new', {
      id: `notif_${Date.now()}`,
      title: 'New Order Received',
      message: `Order #${data.trackingNumber || data.orderId} created and awaiting fulfillment.`,
      type: 'INFO',
      created_at: new Date().toISOString(),
    });
  },

  // 2. ORDER PACKED
  [KAFKA_TOPICS.ORDER_PACKED]: (payload) => {
    emitToDashboard('order:status_updated', payload.data);
  },

  // 3. PACKAGE SHIPPED / TRANSIT
  [KAFKA_TOPICS.PACKAGE_SHIPPED]: (payload) => {
    const data = payload.data;
    emitToDashboard('order:status_updated', data);

    if (data.trackingNumber) {
      emitToShipment(data.trackingNumber, 'shipment:status_changed', data);
    }
    if (data.customerId) {
      emitToUser(data.customerId, 'notification:new', {
        id: `notif_${Date.now()}`,
        title: 'Package Shipped',
        message: `Package ${data.trackingNumber} is now in transit.`,
        type: 'INFO',
        created_at: new Date().toISOString(),
      });
    }
  },

  // 4. PACKAGE DELIVERED
  [KAFKA_TOPICS.PACKAGE_DELIVERED]: (payload) => {
    const data = payload.data;
    emitToDashboard('order:status_updated', data);

    if (data.trackingNumber) {
      emitToShipment(data.trackingNumber, 'shipment:status_changed', data);
    }
    if (data.customerId) {
      emitToUser(data.customerId, 'notification:new', {
        id: `notif_${Date.now()}`,
        title: 'Package Delivered',
        message: `Package ${data.trackingNumber} was successfully delivered!`,
        type: 'SUCCESS',
        created_at: new Date().toISOString(),
      });
    }
  },

  // 5. ORDER CANCELLED
  [KAFKA_TOPICS.ORDER_CANCELLED]: (payload) => {
    emitToDashboard('order:status_updated', payload.data);
  },

  // 6. INVENTORY UPDATED
  [KAFKA_TOPICS.INVENTORY_UPDATED]: (payload) => {
    emitToDashboard('inventory:updated', payload.data);
  },

  // 7. DIRECT NOTIFICATIONS
  [KAFKA_TOPICS.NOTIFICATION_SEND]: (payload) => {
    const { userId, notificationId, title, message, type } = payload.data;
    if (userId) {
      emitToUser(userId, 'notification:new', {
        id: notificationId || `notif_${Date.now()}`,
        title,
        message,
        type: type || 'INFO',
        created_at: new Date().toISOString(),
      });
    }
  },
};

/**
 * Initialize Real-Time WSS Translation Layer
 */
export function initWebSocketSubscribers() {
  Object.entries(eventHandlers).forEach(([topic, handler]) => {
    subscribeEvent(topic, handler);
  });
}
