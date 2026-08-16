import { findMany, findById, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

export async function getAllUsers() {
  const users = await findMany('users');
  return users.map(({ password_hash, ...u }) => u);
}

export async function getUserProfile(id: string) {
  const user = await findById('users', id);
  if (!user) throw { statusCode: 404, message: 'User not found' };
  const { password_hash, ...profile } = user;
  return profile;
}

export async function updateUserRole(id: string, newRole: string, actorId: string) {
  const updated = await update('users', id, { role: newRole });
  if (!updated) throw { statusCode: 404, message: 'User not found' };

  await publishEvent(KAFKA_TOPICS.USER_UPDATED, {
    userId: id,
    newRole,
    actorId,
  });

  const { password_hash, ...profile } = updated;
  return profile;
}
