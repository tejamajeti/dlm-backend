import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// DB & Services
import { checkDbConnection } from './db/connection';
import { seedDatabase } from './scripts/seedDb';
import { initEventBus } from './events/eventBus';

// Middlewares
import { authenticateJWT } from './middleware/authMiddleware';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

// Public Routes (Unauthenticated)
import publicAuthRoutes from './routes/public/authRoutes';
import publicTrackingRoutes from './routes/public/publicTrackingRoutes';

// Protected Routes (JWT & RBAC Required)
import protectedUserRoutes from './routes/protected/userRoutes';
import protectedWarehouseRoutes from './routes/protected/warehouseRoutes';
import protectedOrderRoutes from './routes/protected/orderRoutes';
import protectedInventoryRoutes from './routes/protected/inventoryRoutes';
import protectedTrackingRoutes from './routes/protected/trackingRoutes';
import protectedNotificationRoutes from './routes/protected/notificationRoutes';
import protectedAnalyticsRoutes from './routes/protected/analyticsRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middlewares
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRateLimiter);

// --------------------------------------------------------------------------
// 1. GENERAL / PUBLIC ROUTES (No JWT required)
// --------------------------------------------------------------------------
app.get('/api/v1/public/health', async (req, res) => {
  const dbStatus = await checkDbConnection();
  res.json({
    status: 'ONLINE',
    service: 'Distributed Logistics & Warehouse Management API',
    environment: process.env.NODE_ENV || 'development',
    databaseConnected: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/public/auth', publicAuthRoutes);
app.use('/api/v1/public/tracking', publicTrackingRoutes);

// --------------------------------------------------------------------------
// 2. AUTHENTICATED / PROTECTED ROUTES (JWT token verification required)
// --------------------------------------------------------------------------
app.use('/api/v1/protected', authenticateJWT);

app.use('/api/v1/protected/users', protectedUserRoutes);
app.use('/api/v1/protected/warehouses', protectedWarehouseRoutes);
app.use('/api/v1/protected/orders', protectedOrderRoutes);
app.use('/api/v1/protected/inventory', protectedInventoryRoutes);
app.use('/api/v1/protected/tracking', protectedTrackingRoutes);
app.use('/api/v1/protected/notifications', protectedNotificationRoutes);
app.use('/api/v1/protected/analytics', protectedAnalyticsRoutes);

// Global Error Handler
app.use(errorHandler);

// Server Startup
async function startServer() {
  await initEventBus();
  await seedDatabase();

  app.listen(PORT, () => {
    console.log(`
===============================================================
🚀 DLM Distributed Logistics Engine Running on Port ${PORT}
📦 Public Routes:    http://localhost:${PORT}/api/v1/public
🔒 Protected Routes: http://localhost:${PORT}/api/v1/protected
===============================================================
    `);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
