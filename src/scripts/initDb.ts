import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
import { query } from '../db/crudHelper';
import { pool, checkDbConnection } from '../db/connection';

dotenv.config();

/**
 * Ensure database 'dml' exists on local PostgreSQL instance
 */
async function ensureDatabaseExists() {
  const targetDb = process.env.PGDATABASE || 'dml';
  const host = process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.PGPORT || '5432', 10);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres', // Connect to root postgres database first
  });

  try {
    await client.connect();
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDb]);
    if (res.rowCount === 0) {
      console.log(`🔨 Creating database '${targetDb}' on local PostgreSQL server...`);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`✅ Database '${targetDb}' created successfully.`);
    }
  } catch (err: any) {
    // Silent catch if connection fails or db already exists
  } finally {
    await client.end().catch(() => {});
  }
}

export async function initializeDatabase() {
  console.log('🚀 Initializing Distributed Logistics Database Schemas...');

  await ensureDatabaseExists();

  const schemaSql = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- 1. USERS TABLE (RBAC: Admin, Warehouse Manager, Driver, Customer, Operator)
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('Admin', 'Warehouse Manager', 'Driver', 'Customer', 'Operator')),
      phone VARCHAR(50),
      avatar VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. WAREHOUSES TABLE
    CREATE TABLE IF NOT EXISTS warehouses (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      address VARCHAR(255) NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      zip_code VARCHAR(20) NOT NULL,
      capacity INT NOT NULL DEFAULT 10000,
      current_occupancy INT NOT NULL DEFAULT 0,
      latitude NUMERIC(10, 7),
      longitude NUMERIC(10, 7),
      manager_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. PRODUCTS TABLE
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      sku VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 1.0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. INVENTORY TABLE
    CREATE TABLE IF NOT EXISTS inventory (
      id VARCHAR(64) PRIMARY KEY,
      warehouse_id VARCHAR(64) REFERENCES warehouses(id) ON DELETE CASCADE,
      product_id VARCHAR(64) REFERENCES products(id) ON DELETE CASCADE,
      quantity INT NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 20,
      reorder_quantity INT NOT NULL DEFAULT 100,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(warehouse_id, product_id)
    );

    -- 5. ORDERS TABLE
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      tracking_number VARCHAR(100) UNIQUE NOT NULL,
      customer_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      origin_warehouse_id VARCHAR(64) REFERENCES warehouses(id) ON DELETE SET NULL,
      destination_address TEXT NOT NULL,
      destination_city VARCHAR(100) NOT NULL,
      destination_zip VARCHAR(20) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'CREATED' 
        CHECK (status IN ('CREATED', 'PROCESSING', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')),
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      driver_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. ORDER ITEMS TABLE
    CREATE TABLE IF NOT EXISTS order_items (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
      product_id VARCHAR(64) REFERENCES products(id) ON DELETE CASCADE,
      quantity INT NOT NULL DEFAULT 1,
      unit_price NUMERIC(12, 2) NOT NULL
    );

    -- 7. PACKAGES TABLE
    CREATE TABLE IF NOT EXISTS packages (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
      package_code VARCHAR(100) UNIQUE NOT NULL,
      weight_kg NUMERIC(8, 2) NOT NULL,
      dimensions VARCHAR(50),
      current_location VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'PREPARING',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. DRIVER LOCATIONS TABLE (Telemetry)
    CREATE TABLE IF NOT EXISTS driver_locations (
      id VARCHAR(64) PRIMARY KEY,
      driver_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
      latitude NUMERIC(10, 7) NOT NULL,
      longitude NUMERIC(10, 7) NOT NULL,
      speed_kmh NUMERIC(5, 2) DEFAULT 0,
      heading INT DEFAULT 0,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. NOTIFICATIONS TABLE
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'INFO',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. AUDIT LOGS TABLE
    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      actor_id VARCHAR(64),
      action VARCHAR(100) NOT NULL,
      entity VARCHAR(100) NOT NULL,
      entity_id VARCHAR(64),
      details JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (await checkDbConnection()) {
    try {
      await query(schemaSql);
      console.log('✅ PostgreSQL Tables and Indexes created successfully.');
    } catch (err) {
      console.error('❌ Error executing database initialization SQL:', err);
    }
  } else {
    console.log('ℹ️ In-memory schema initialized for local dev execution.');
  }
}

if (process.argv[1] && process.argv[1].includes('initDb')) {
  initializeDatabase().then(() => pool.end());
}
