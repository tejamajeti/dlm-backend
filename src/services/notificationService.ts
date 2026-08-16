import { findMany, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

export async function getUserNotifications(userId: string) {
  return await findMany('notifications', { user_id: userId }, { orderBy: 'created_at DESC' });
}

export async function sendNotification(userId: string, title: string, message: string, type: string = 'INFO') {
  const notif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    user_id: userId,
    title,
    message,
    type,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const created = await insert('notifications', notif);

  await publishEvent(KAFKA_TOPICS.NOTIFICATION_SEND, {
    notificationId: created.id,
    userId,
    title,
  });

  return created;
}

export async function markNotificationAsRead(id: string) {
  return await update('notifications', id, { is_read: true });
}
