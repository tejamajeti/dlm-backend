import { subscribeEvent } from '../eventBus';
import { KAFKA_TOPICS } from '../topics';
import {
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendPackageShippedEmail,
  sendPackageDeliveredEmail,
  sendEmail,
} from '../../services/emailService';
import { findById } from '../../db/crudHelper';

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

  console.log('✅ Notification Subscribers Registered Successfully');
}
