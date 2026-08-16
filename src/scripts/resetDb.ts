import { query, seedInMemoryStore } from '../db/crudHelper';
import { pool, checkDbConnection } from '../db/connection';

export async function resetDatabase() {
  console.log('🧹 Resetting Distributed Logistics Database...');

  if (await checkDbConnection()) {
    try {
      await query(`
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS notifications CASCADE;
        DROP TABLE IF EXISTS driver_locations CASCADE;
        DROP TABLE IF EXISTS packages CASCADE;
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS inventory CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS warehouses CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);
      console.log('✅ PostgreSQL tables dropped.');
    } catch (e) {
      console.error('Error dropping tables:', e);
    }
  }

  seedInMemoryStore('users', []);
  seedInMemoryStore('warehouses', []);
  seedInMemoryStore('products', []);
  seedInMemoryStore('inventory', []);
  seedInMemoryStore('orders', []);
  seedInMemoryStore('packages', []);
  seedInMemoryStore('driver_locations', []);
  seedInMemoryStore('notifications', []);
  seedInMemoryStore('audit_logs', []);

  console.log('✅ Database reset complete.');
}

if (process.argv[1] && process.argv[1].includes('resetDb')) {
  resetDatabase().then(() => pool.end());
}
