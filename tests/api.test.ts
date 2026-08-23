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
        email: 'admin@dlm.logistics',
        password: 'Admin@123',
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
        email: 'admin@dlm.logistics',
        password: 'Admin@123',
      });
    const token = loginRes.body.data.token;

    const res = await request(app)
      .get('/api/v1/protected/warehouses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/protected/orders - should create new order successfully', async () => {
    const loginRes = await request(app)
      .post('/api/v1/public/auth/login')
      .send({
        email: 'admin@dlm.logistics',
        password: 'Admin@123',
      });
    const token = loginRes.body.data.token;

    const res = await request(app)
      .post('/api/v1/protected/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        origin_warehouse_id: 'wh_nyc_01',
        destination_address: '123 Main St',
        destination_city: 'New York',
        destination_zip: '10001',
        total_amount: 250.00,
        currency: 'USD'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.currency).toBe('USD');
  });
});
