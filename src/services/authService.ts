import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { findMany, insert, findById } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';
import { cacheSet, cacheGet, cacheDel } from '../config/redis';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dlm_super_secret_jwt_key_2026_production_ready';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Short-lived Access Token (15 min)
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'; // Long-lived Refresh Token (7 days)
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600; // 7 days in seconds

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
  // Prevent public self-registration of elevated privilege roles (Admin / Operator)
  const requestedRole = data.role || 'Customer';
  const userRole = (requestedRole === 'Admin' || requestedRole === 'Operator') ? 'Customer' : requestedRole;
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

  const accessToken = generateJwtToken(created, JWT_EXPIRES_IN);
  const refreshToken = await generateRefreshToken(created);

  const { password_hash: _, ...userWithoutPassword } = created;

  return { user: userWithoutPassword, token: accessToken, refreshToken };
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

  const accessToken = generateJwtToken(user, JWT_EXPIRES_IN);
  const refreshToken = await generateRefreshToken(user);

  const { password_hash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token: accessToken, refreshToken };
}

/**
 * Generate short-lived Access Token (JWT)
 */
export function generateJwtToken(user: any, customExpiresIn?: string) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    JWT_SECRET,
    { expiresIn: (customExpiresIn || JWT_EXPIRES_IN) as any }
  );
}

/**
 * Generate long-lived Refresh Token (7 days) and save state in Redis
 */
export async function generateRefreshToken(user: any): Promise<string> {
  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN as any }
  );

  // Store refresh token session in Redis cache with 7 day TTL
  await cacheSet(
    `refresh:${refreshToken}`,
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      created_at: new Date().toISOString(),
    },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return refreshToken;
}

/**
 * Refresh Access Token using Refresh Token
 */
export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) {
    throw { statusCode: 400, message: 'Refresh token is required' };
  }

  // 1. Verify token signature
  let decoded: any;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch (err: any) {
    throw { statusCode: 401, message: 'Invalid or expired refresh token' };
  }

  // 2. Check token in Redis store
  const cachedSession = await cacheGet(`refresh:${refreshToken}`);
  if (!cachedSession) {
    throw { statusCode: 401, message: 'Refresh token has been revoked or expired' };
  }

  // 3. Load user account
  const user = await findById('users', decoded.id);
  if (!user) {
    throw { statusCode: 401, message: 'User associated with refresh token not found' };
  }

  // 4. Issue a new 15-minute Access Token
  const newAccessToken = generateJwtToken(user, JWT_EXPIRES_IN);
  const { password_hash: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
    token: newAccessToken,
    refreshToken,
  };
}

/**
 * Revoke Refresh Token (on logout)
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  if (refreshToken) {
    await cacheDel(`refresh:${refreshToken}`);
  }
}
