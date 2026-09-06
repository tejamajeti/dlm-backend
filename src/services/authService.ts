import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { findMany, insert, findById, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';
import { cacheSet, cacheGet, cacheDel } from '../config/redis';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dlm_super_secret_jwt_key_2026_production_ready';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Short-lived Access Token (15 min)
const REFRESH_TOKEN_EXPIRES_IN_PERSISTENT = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'; // 7 days when rememberMe is true
const REFRESH_TOKEN_TTL_PERSISTENT = 7 * 24 * 3600; // 7 days in seconds
const REFRESH_TOKEN_EXPIRES_IN_SESSION = '8h'; // 8 hours (standard enterprise shift) when rememberMe is false
const REFRESH_TOKEN_TTL_SESSION = 8 * 3600; // 8 hours in seconds

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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
  const role = ['Admin', 'Operator'].includes(requestedRole) ? 'Customer' : requestedRole;

  const userId = `usr_customer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const created = await insert('users', {
    id: userId,
    email: data.email,
    password_hash,
    full_name: data.full_name,
    role,
    phone: data.phone || null,
    avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80`,
    auth_provider: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Publish USER_CREATED event to Kafka asynchronously without crashing registration on broker error
  try {
    await publishEvent(KAFKA_TOPICS.USER_CREATED, {
      userId: created.id,
      email: created.email,
      role: created.role,
      full_name: created.full_name,
    });
  } catch (eventErr: any) {
    console.error('⚠️ Failed to dispatch USER_CREATED event to bus:', eventErr?.message || eventErr);
  }

  const accessToken = generateJwtToken(created, JWT_EXPIRES_IN);
  const refreshToken = await generateRefreshToken(created, true);

  const { password_hash: _, ...userWithoutPassword } = created;

  return { user: userWithoutPassword, token: accessToken, refreshToken };
}

export async function loginUser(email: string, password: string, rememberMe: boolean = true) {
  const users = await findMany('users', { email });
  if (users.length === 0) {
    throw { statusCode: 401, message: 'Invalid credentials' };
  }

  const user = users[0];
  if (!user.password_hash) {
    throw {
      statusCode: 401,
      message: 'Invalid credentials',
    };
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw { statusCode: 401, message: 'Invalid credentials' };
  }

  const accessToken = generateJwtToken(user, JWT_EXPIRES_IN);
  const refreshToken = await generateRefreshToken(user, rememberMe);

  const { password_hash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token: accessToken, refreshToken, rememberMe };
}

/**
 * Authenticate or register a user via Google OAuth 2.0 Identity Services
 */
export async function googleLoginOrRegister(
  input: string | { credential?: string; accessToken?: string; token?: string; role?: string },
  rememberMe: boolean = true
) {
  const credential = typeof input === 'string' ? input : input.credential || input.token;
  const googleAccessToken = typeof input === 'object' ? input.accessToken : undefined;
  const requestedRole = typeof input === 'object' ? input.role : undefined;

  if (!credential && !googleAccessToken) {
    throw { statusCode: 400, message: 'Google credential or access token is required' };
  }

  let payload: {
    sub: string;
    email: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    email_verified?: boolean;
  } | null = null;

  if (googleAccessToken) {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });
      if (!resp.ok) {
        throw new Error(`Google profile response returned status ${resp.status}`);
      }
      const data: any = await resp.json();
      if (!data?.email) throw new Error('No email found in Google profile');
      payload = {
        sub: data.sub,
        email: data.email,
        name: data.name || [data.given_name, data.family_name].filter(Boolean).join(' ') || 'Google User',
        given_name: data.given_name,
        family_name: data.family_name,
        picture: data.picture,
        email_verified: data.email_verified,
      };
    } catch (err: any) {
      throw { statusCode: 401, message: `Google access token validation failed: ${err.message}` };
    }
  } else if (credential) {
    if (!GOOGLE_CLIENT_ID) {
      throw { statusCode: 500, message: 'Google OAuth Client ID is not configured on the server' };
    }
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const ticketPayload = ticket?.getPayload();
      if (!ticketPayload?.email) {
        throw new Error('Google token payload missing verified email');
      }
      payload = {
        sub: ticketPayload.sub,
        email: ticketPayload.email,
        name:
          ticketPayload.name ||
          [ticketPayload.given_name, ticketPayload.family_name].filter(Boolean).join(' ') ||
          'Google User',
        given_name: ticketPayload.given_name,
        family_name: ticketPayload.family_name,
        picture: ticketPayload.picture,
        email_verified: ticketPayload.email_verified,
      };
    } catch (err: any) {
      throw { statusCode: 401, message: `Google token verification failed: ${err.message || 'Invalid token'}` };
    }
  }

  if (!payload || !payload.email) {
    throw { statusCode: 400, message: 'Unable to extract email from Google credential' };
  }

  // 0. Enforce verified email from Google to prevent account hijacking
  if (!payload.email_verified) {
    throw { statusCode: 403, message: 'Google account email is not verified by Google. Authentication rejected.' };
  }

  // 1. Check if user exists by google_id
  let users = await findMany('users', { google_id: payload.sub });
  let user = users.length > 0 ? users[0] : null;

  // 2. If not found by google_id, check by email (automatic account linking for verified accounts)
  if (!user && payload.email_verified) {
    users = await findMany('users', { email: payload.email });
    if (users.length > 0) {
      user = users[0];
      await update('users', user.id, {
        google_id: payload.sub,
        avatar: payload.picture || user.avatar,
        full_name: user.full_name || payload.name,
        updated_at: new Date().toISOString(),
      });
      user = await findById('users', user.id);
    }
  } else if (payload.picture && user.avatar !== payload.picture) {
    // Keep avatar updated if Google profile picture changed
    await update('users', user.id, {
      avatar: payload.picture,
      updated_at: new Date().toISOString(),
    });
    user.avatar = payload.picture;
  }

  // 3. If user is brand-new and no role has been chosen yet, request role selection from onboarding modal
  if (!user && !requestedRole) {
    return {
      isNewUser: true,
      profile: {
        email: payload.email,
        name: payload.name || 'Google User',
        given_name: payload.given_name,
        family_name: payload.family_name,
        avatar: payload.picture || null,
      },
      credential: credential || undefined,
      accessToken: googleAccessToken || undefined,
    };
  }

  // 4. If user is brand-new and role is provided, provision account
  if (!user) {
    // Sanitize role: Only Customer, Driver, or Warehouse Manager can be self-selected
    const allowedRoles = ['Customer', 'Driver', 'Warehouse Manager'];
    const chosenRole = allowedRoles.includes(requestedRole as string) ? requestedRole : 'Customer';

    const rolePrefix = chosenRole === 'Driver' ? 'driver' : chosenRole === 'Warehouse Manager' ? 'mgr' : 'customer';
    const newUserId = `usr_${rolePrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      user = await insert('users', {
        id: newUserId,
        email: payload.email,
        full_name: payload.name || 'Google User',
        role: chosenRole,
        password_hash: null,
        avatar: payload.picture || null,
        google_id: payload.sub,
        auth_provider: 'google',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (insertErr: any) {
      // Concurrency protection: If user was inserted in a parallel request, fetch existing
      const existing = await findMany('users', { email: payload.email });
      if (existing.length > 0) {
        user = existing[0];
      } else {
        throw insertErr;
      }
    }

    // Publish USER_CREATED event to Kafka asynchronously without crashing auth flow on broker failure
    try {
      await publishEvent(KAFKA_TOPICS.USER_CREATED, {
        userId: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
      });
    } catch (eventErr: any) {
      console.error('⚠️ Failed to dispatch USER_CREATED event to bus:', eventErr?.message || eventErr);
    }
  }

  const accessToken = generateJwtToken(user, JWT_EXPIRES_IN);
  const refreshToken = await generateRefreshToken(user, rememberMe);

  const { password_hash: _, ...userWithoutPassword } = user;

  return { isNewUser: false, user: userWithoutPassword, token: accessToken, refreshToken, rememberMe };
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
 * Generate Refresh Token (7 days if rememberMe, 8 hours if session-only) and save state in Redis
 */
export async function generateRefreshToken(user: any, rememberMe: boolean = true): Promise<string> {
  const expiresIn = rememberMe ? REFRESH_TOKEN_EXPIRES_IN_PERSISTENT : REFRESH_TOKEN_EXPIRES_IN_SESSION;
  const ttlSeconds = rememberMe ? REFRESH_TOKEN_TTL_PERSISTENT : REFRESH_TOKEN_TTL_SESSION;

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
      rememberMe,
    },
    JWT_SECRET,
    { expiresIn: expiresIn as any }
  );

  // Store refresh token session in Redis cache with configured TTL
  await cacheSet(
    `refresh:${refreshToken}`,
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      rememberMe,
      created_at: new Date().toISOString(),
    },
    ttlSeconds
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

  // 2. Prevent token confusion (ensure token was issued as a refresh token)
  if (decoded?.type !== 'refresh') {
    throw { statusCode: 401, message: 'Invalid token type. Expected a refresh token' };
  }

  // 3. Check if token was explicitly revoked
  const isRevoked = await cacheGet(`revoked:${refreshToken}`);
  if (isRevoked) {
    throw { statusCode: 401, message: 'Refresh token has been revoked' };
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
    await cacheSet(`revoked:${refreshToken}`, true, REFRESH_TOKEN_TTL_PERSISTENT);
  }
}
