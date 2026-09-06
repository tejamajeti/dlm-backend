import { subscribeEvent } from '../eventBus';
import { KAFKA_TOPICS } from '../topics';
import {
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendPackageShippedEmail,
  sendPackageDeliveredEmail,
  sendLowStockAlertEmail,
  sendEmail,
} from '../../services/emailService';
import { findById, insert } from '../../db/crudHelper';

// In-memory rate limiting map to prevent alert email spamming for the same item (1-hour cooldown)
const lastAlertTimeMap = new Map<string, number>();
const EMAIL_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour Cooldown

/**
 * Initialize Event-Driven Notification Subscribers
 * Listens to published Kafka / EventBus topics and triggers email dispatches.
 */
export function initNotificationSubscribers() {
  // ------------------------------------------------------------------------
  // 1. Consumer: USER_CREATED
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.USER_CREATED, async (payload) => {
    try {
      const { email, role, full_name } = payload.data;
      if (email) {
        await sendWelcomeEmail(email, full_name || 'Valued User', role || 'Customer');
      }
    } catch (err) {
      console.error('[Notification Subscriber Error - USER_CREATED]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 2. Consumer: ORDER_CREATED
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.ORDER_CREATED, async (payload) => {
    try {
      const { orderId, trackingNumber, customerId, totalAmount } = payload.data;
      let recipientEmail = 'customer@synapship.com';

      if (customerId) {
        const user = await findById('users', customerId);
        if (user && user.email) {
          recipientEmail = user.email;
        }
      }

      await sendOrderConfirmationEmail(recipientEmail, orderId, trackingNumber || 'SYN-SHIPMENT', Number(totalAmount || 0));
    } catch (err) {
      console.error('[Notification Subscriber Error - ORDER_CREATED]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 3. Consumer: PACKAGE_SHIPPED
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.PACKAGE_SHIPPED, async (payload) => {
    try {
      const { trackingNumber, currentLocation, customerEmail } = payload.data;
      const targetEmail = customerEmail || 'customer@synapship.com';

      await sendPackageShippedEmail(targetEmail, trackingNumber, currentLocation || 'Central Sorting Hub');
    } catch (err) {
      console.error('[Notification Subscriber Error - PACKAGE_SHIPPED]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 4. Consumer: PACKAGE_DELIVERED
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.PACKAGE_DELIVERED, async (payload) => {
    try {
      const { trackingNumber, customerEmail } = payload.data;
      const targetEmail = customerEmail || 'customer@synapship.com';

      await sendPackageDeliveredEmail(targetEmail, trackingNumber);
    } catch (err) {
      console.error('[Notification Subscriber Error - PACKAGE_DELIVERED]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 5. Consumer: NOTIFICATION_SEND
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.NOTIFICATION_SEND, async (payload) => {
    try {
      const { userId, title, message, email } = payload.data;
      let targetEmail = email;

      if (!targetEmail && userId) {
        const user = await findById('users', userId);
        if (user && user.email) {
          targetEmail = user.email;
        }
      }

      if (targetEmail) {
        await sendEmail({
          to: targetEmail,
          subject: title || 'Synapship Notification',
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h3>${title}</h3><p>${message || ''}</p></div>`,
        });
      }
    } catch (err) {
      console.error('[Notification Subscriber Error - NOTIFICATION_SEND]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 6. Consumer: INVENTORY_UPDATED (Low Stock Warning Alert)
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.INVENTORY_UPDATED, async (payload) => {
    try {
      const { inventoryId, newQuantity, reorderLevel } = payload.data;
      if (inventoryId) {
        const inv = await findById('inventory', inventoryId);
        if (inv) {
          const currentQty = newQuantity !== undefined ? newQuantity : inv.quantity;
          const threshold = reorderLevel !== undefined ? reorderLevel : inv.reorder_level;

          if (currentQty <= threshold) {
            const product = (await findById('products', inv.product_id)) || { name: 'Product', sku: 'SKU-UNKNOWN' };
            const warehouse = (await findById('warehouses', inv.warehouse_id)) || { name: inv.warehouse_id, code: inv.warehouse_id };

            const managerUser = warehouse.manager_id ? await findById('users', warehouse.manager_id) : null;

            if (managerUser) {
              await insert('notifications', {
                id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                user_id: managerUser.id,
                title: `Low Stock Warning: ${product.name}`,
                message: `Stock level in ${warehouse.name} dropped to ${currentQty} units (Threshold: ${threshold} units).`,
                type: 'WARNING',
                is_read: false,
                created_at: new Date().toISOString(),
              });
            }

            if (managerUser && managerUser.role === 'Warehouse Manager' && managerUser.email) {
              const lastSent = lastAlertTimeMap.get(inventoryId) || 0;
              const now = Date.now();

              if (now - lastSent > EMAIL_ALERT_COOLDOWN_MS) {
                lastAlertTimeMap.set(inventoryId, now);

                await sendLowStockAlertEmail(
                  managerUser.email,
                  product.name,
                  product.sku,
                  warehouse.name,
                  currentQty,
                  threshold
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[Notification Subscriber Error - INVENTORY_UPDATED]:', err);
    }
  });
}
