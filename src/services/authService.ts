import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { findMany, insert, findById } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dlm_super_secret_jwt_key_2026_production_ready';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

export async function registerUser(data: {
  email: string;
  password: string;
  full_name: string;
  role?: string;
  phone?: string;
}) {
  const existing = await findMany('users', { email: data.email });
  if (existing.length > 0) {
    throw { statusCode: 400, message: 'User with this email address already exists' };
  }

  const password_hash = await bcrypt.hash(data.password, 10);
  const userRole = data.role || 'Customer';
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const newUser = {
    id: userId,
    email: data.email,
    password_hash,
    full_name: data.full_name,
    role: userRole,
    phone: data.phone || '',
    avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const created = await insert('users', newUser);

  await publishEvent(KAFKA_TOPICS.USER_CREATED, {
    userId: created.id,
    email: created.email,
    role: created.role,
  });

  const token = generateJwtToken(created);
  const { password_hash: _, ...userWithoutPassword } = created;

  return { user: userWithoutPassword, token };
}

export async function loginUser(email: string, password: string) {
  const users = await findMany('users', { email });
  if (users.length === 0) {
    throw { statusCode: 401, message: 'Invalid credentials' };
  }

  const user = users[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw { statusCode: 401, message: 'Invalid credentials' };
  }

  const token = generateJwtToken(user);
  const { password_hash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token };
}

export function generateJwtToken(user: any) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );
}
