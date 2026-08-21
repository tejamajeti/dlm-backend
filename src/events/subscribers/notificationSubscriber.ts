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
  console.log('🔔 Initializing Event-Driven Notification Subscribers...');

  // ------------------------------------------------------------------------
  // 1. Consumer: USER_CREATED
  // ------------------------------------------------------------------------
  subscribeEvent(KAFKA_TOPICS.USER_CREATED, async (payload) => {
    try {
      console.log("[Subscribe Event Called]", payload?.data);
      const { email, role, full_name } = payload.data;
      if (email) {
        console.log(`[Notification Subscriber] Handling user.created for ${email}`);
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
      let recipientEmail = 'customer@dlm-logistics.com';

      if (customerId) {
        const user = await findById('users', customerId);
        if (user && user.email) {
          recipientEmail = user.email;
        }
      }

      console.log(`[Notification Subscriber] Handling order.created for Order #${orderId}`);
      await sendOrderConfirmationEmail(recipientEmail, orderId, trackingNumber || 'DLM-SHIPMENT', Number(totalAmount || 0));
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
      const targetEmail = customerEmail || 'customer@dlm-logistics.com';

      console.log(`[Notification Subscriber] Handling package.shipped for ${trackingNumber}`);
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
      const targetEmail = customerEmail || 'customer@dlm-logistics.com';

      console.log(`[Notification Subscriber] Handling package.delivered for ${trackingNumber}`);
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
        console.log(`[Notification Subscriber] Dispatching custom email to ${targetEmail}`);
        await sendEmail({
          to: targetEmail,
          subject: title || 'DLM Logistics Notification',
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h3>${title}</h3><p>${message || ''}</p></div>`,
        });
      }
    } catch (err) {
      console.error('[Notification Subscriber Error - NOTIFICATION_SEND]:', err);
    }
  });

  // ------------------------------------------------------------------------
  // 6. Consumer: INVENTORY_UPDATED (Low Stock Warning Alert)
  // Strict Targeted Routing: Relevant Warehouse Managers ONLY (Admins Excluded) + 1-Hour Cooldown
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

            console.log(`[Notification Subscriber] ⚠️ Low Stock Alert triggered for ${product.name} (${currentQty}/${threshold} units)`);

            // Fetch assigned manager user
            const managerUser = warehouse.manager_id ? await findById('users', warehouse.manager_id) : null;

            // 1. Create In-App Notification in DB for the Manager (if assigned)
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

            // 2. Strict Check: Send Email ONLY if assigned user is a Warehouse Manager (ADMINS EXCLUDED)
            if (managerUser && managerUser.role === 'Warehouse Manager' && managerUser.email) {
              const lastSent = lastAlertTimeMap.get(inventoryId) || 0;
              const now = Date.now();

              if (now - lastSent > EMAIL_ALERT_COOLDOWN_MS) {
                lastAlertTimeMap.set(inventoryId, now);

                console.log(`[Notification Subscriber] Dispatching Low Stock Warning Email strictly to Warehouse Manager (${managerUser.email})`);

                await sendLowStockAlertEmail(
                  managerUser.email,
                  product.name,
                  product.sku,
                  warehouse.name,
                  currentQty,
                  threshold
                );
              } else {
                console.log(`[Notification Subscriber] ℹ️ Alert email suppressed for ${inventoryId} (1-hour cooldown active)`);
              }
            } else {
              console.log(`[Notification Subscriber] ℹ️ Skipped alert email: No dedicated Warehouse Manager assigned to ${warehouse.name} (Admins excluded)`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Notification Subscriber Error - INVENTORY_UPDATED]:', err);
    }
  });

  console.log('✅ Notification Subscribers Registered Successfully');
}
