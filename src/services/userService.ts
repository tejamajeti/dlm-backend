import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findMany, findById, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

const JWT_SECRET = process.env.JWT_SECRET || 'dlm_super_secret_jwt_key_2026_production_ready';

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

export async function createUserByAdmin(
  data: {
    email: string;
    password: string;
    full_name: string;
    role: string;
    phone?: string;
  },
  actorId: string
) {
  const existing = await findMany('users', { email: data.email });
  if (existing.length > 0) {
    throw { statusCode: 400, message: 'User with this email address already exists' };
  }

  const password_hash = await bcrypt.hash(data.password, 10);
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const newUser = {
    id: userId,
    email: data.email,
    password_hash,
    full_name: data.full_name,
    role: data.role || 'Customer',
    phone: data.phone || '',
    avatar: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const created = await insert('users', newUser);

  await publishEvent(KAFKA_TOPICS.USER_CREATED, {
    userId: created.id,
    email: created.email,
    role: created.role,
    createdByAdmin: actorId,
  });

  const { password_hash: _, ...userProfile } = created;
  return userProfile;
}

export async function updateUserByAdmin(
  id: string,
  data: {
    full_name?: string;
    email?: string;
    role?: string;
    phone?: string;
    password?: string;
  },
  actorId: string
) {
  const existing = await findById('users', id);
  if (!existing) throw { statusCode: 404, message: 'User not found' };

  const updateFields: any = { updated_at: new Date().toISOString() };
  if (data.full_name) updateFields.full_name = data.full_name;
  if (data.email) updateFields.email = data.email;
  if (data.role) updateFields.role = data.role;
  if (data.phone !== undefined) updateFields.phone = data.phone;
  if (data.password) {
    updateFields.password_hash = await bcrypt.hash(data.password, 10);
  }

  const updated = await update('users', id, updateFields);
  if (!updated) throw { statusCode: 404, message: 'Failed to update user' };

  await publishEvent(KAFKA_TOPICS.USER_UPDATED, {
    userId: id,
    updatedFields: Object.keys(updateFields),
    actorId,
  });

  const { password_hash: _, ...profile } = updated;
  return profile;
}

export async function impersonateUser(targetUserId: string, adminUser: any) {
  const targetUser = await findById('users', targetUserId);
  if (!targetUser) throw { statusCode: 404, message: 'Target user account not found' };

  // Generate short-lived 5-minute JWT token for temporary access links
  const token = jwt.sign(
    {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      full_name: targetUser.full_name,
      isImpersonating: true,
      impersonatedBy: adminUser.id,
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  const { password_hash: _, ...userProfile } = targetUser;
  return { user: userProfile, token, expiresInMinutes: 5, expiresAt: Date.now() + 5 * 60 * 1000 };
}
