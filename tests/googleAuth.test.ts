import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/server';
import { googleClient } from '../src/services/authService';
import { seedDatabase } from '../src/scripts/seedDb';

describe('Google Authentication API Tests', () => {
  beforeAll(async () => {
    jest.spyOn(googleClient, 'verifyIdToken').mockImplementation(async (options: any) => {
      const decoded: any = jwt.decode(options.idToken);
      return {
        getPayload: () => ({
          sub: decoded?.sub || 'google-user-123',
          email: decoded?.email || 'test@example.com',
          name: decoded?.name || 'David Driver',
          picture: decoded?.picture || 'https://example.com/photo.jpg',
          email_verified: decoded?.email_verified !== undefined ? decoded.email_verified : true,
        }),
      } as any;
    });

    await seedDatabase();
  }, 30000);

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('POST /api/v1/public/auth/google - should reject request without credential or accessToken', async () => {
    const res = await request(app).post('/api/v1/public/auth/google').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Google credential or accessToken is required');
  });

  it('POST /api/v1/public/auth/google - should prompt for role onboarding if user is new and role is omitted', async () => {
    const email = `new.google.user.${Date.now()}@example.com`;
    const mockGoogleToken = jwt.sign(
      {
        sub: `sub_${Date.now()}_1`,
        email,
        name: 'David Driver',
        picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
        email_verified: true,
      },
      'dev_mock_signing_key'
    );

    const res = await request(app)
      .post('/api/v1/public/auth/google')
      .send({ credential: mockGoogleToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.data.profile.email).toBe(email);
  });

  it('POST /api/v1/public/auth/google - should successfully provision new user with selected Driver role', async () => {
    const email = `driver.user.${Date.now()}@example.com`;
    const mockGoogleToken = jwt.sign(
      {
        sub: `sub_${Date.now()}_2`,
        email,
        name: 'David Driver',
        picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
        email_verified: true,
      },
      'dev_mock_signing_key'
    );

    const res = await request(app)
      .post('/api/v1/public/auth/google')
      .send({ credential: mockGoogleToken, role: 'Driver' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('Driver');
    expect(res.body.data.user.auth_provider).toBe('google');
  });

  it('POST /api/v1/public/auth/google - should link existing email account to Google ID', async () => {
    const testEmail = `link.user.${Date.now()}@example.com`;
    const regRes = await request(app).post('/api/v1/public/auth/register').send({
      email: testEmail,
      password: 'SecurePassword123!',
      full_name: 'Link User Test',
      role: 'Warehouse Manager',
    });
    expect(regRes.statusCode).toBe(201);
    expect(regRes.body.data.user.role).toBe('Warehouse Manager');

    // Now authenticate via Google with the same email
    const mockGoogleToken = jwt.sign(
      {
        sub: `sub_${Date.now()}_3`,
        email: testEmail,
        name: 'Link User Test',
        picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        email_verified: true,
      },
      'dev_mock_signing_key'
    );

    const res = await request(app)
      .post('/api/v1/public/auth/google')
      .send({ credential: mockGoogleToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.user.role).toBe('Warehouse Manager'); // Preserves existing role
    expect(res.body.data.user.google_id).toBeDefined();
  });
});
