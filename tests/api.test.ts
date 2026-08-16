import request from 'supertest';
import app from '../src/server';
import { seedDatabase } from '../src/scripts/seedDb';

describe('DLM Logistics API Tests', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('GET /api/v1/public/health - should return 200 OK', async () => {
    const res = await request(app).get('/api/v1/public/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ONLINE');
  });

  it('POST /api/v1/public/auth/login - should authenticate valid user', async () => {
    const res = await request(app)
      .post('/api/v1/public/auth/login')
      .send({
        email: 'tejasaimanikanta2004@gmail.com',
        password: 'Teja@512',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('GET /api/v1/protected/warehouses - should reject request without JWT token', async () => {
    const res = await request(app).get('/api/v1/protected/warehouses');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Authentication failed');
  });

  it('GET /api/v1/protected/warehouses - should allow request with valid JWT token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/public/auth/login')
      .send({
        email: 'tejasaimanikanta2004@gmail.com',
        password: 'Teja@512',
      });
    const token = loginRes.body.data.token;

    const res = await request(app)
      .get('/api/v1/protected/warehouses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
