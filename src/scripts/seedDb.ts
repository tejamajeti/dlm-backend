import bcrypt from 'bcryptjs';
import { insert, seedInMemoryStore, query, findById } from '../db/crudHelper';
import { checkDbConnection, pool } from '../db/connection';
import { initializeDatabase } from './initDb';

export async function seedDatabase() {
  console.log('🌱 Seeding Distributed Logistics Database with Demo Data...');

  await initializeDatabase();

  const passwordHash = await bcrypt.hash('Teja@512', 10);

  // 1. USERS (Consistent IDs: usr_[role]_[index])
  const users = [
    {
      id: 'usr_admin_01',
      email: 'tejasaimanikanta2004@gmail.com',
      password_hash: passwordHash,
      full_name: 'TEJA MAJETI(Admin)',
      role: 'Admin',
      phone: '+91 8122559225',
      avatar: '',
    },
    {
      id: 'usr_manager_01',
      email: 'manager.nyc@dlm.logistics',
      password_hash: passwordHash,
      full_name: 'Sarah Connor (NYC Manager)',
      role: 'Warehouse Manager',
      phone: '+1 (555) 018-9922',
      avatar: '',
    },
    {
      id: 'usr_manager_02',
      email: 'manager.la@dlm.logistics',
      password_hash: passwordHash,
      full_name: 'Michael Scott (LA Manager)',
      role: 'Warehouse Manager',
      phone: '+1 (555) 017-3344',
      avatar: '',
    },
    {
      id: 'usr_driver_01',
      email: 'driver.john@dlm.logistics',
      password_hash: passwordHash,
      full_name: 'John Wick (Fleet Driver)',
      role: 'Driver',
      phone: '+1 (555) 014-5566',
      avatar: '',
    },
    {
      id: 'usr_driver_02',
      email: 'driver.elena@dlm.logistics',
      password_hash: passwordHash,
      full_name: 'Elena Rostova (Express Driver)',
      role: 'Driver',
      phone: '+1 (555) 012-7788',
      avatar: '',
    },
    {
      id: 'usr_customer_01',
      email: 'customer@acmecorp.com',
      password_hash: passwordHash,
      full_name: 'Bruce Wayne (Acme Corp)',
      role: 'Customer',
      phone: '+1 (555) 011-0011',
      avatar: '',
    },
  ];

  // 2. WAREHOUSES (Consistent IDs & Codes: wh_[city_code] & WH-[CITY_3]-[INDEX])
  const warehouses = [
    {
      id: 'wh_nyc_01',
      code: 'WH-NYC-01',
      name: 'New York Metro Fulfillment Hub',
      address: '100 Logistics Way, Queens',
      city: 'New York',
      state: 'NY',
      zip_code: '11101',
      capacity: 50000,
      current_occupancy: 32400,
      latitude: 40.7128,
      longitude: -74.006,
      manager_id: 'usr_manager_01',
    },
    {
      id: 'wh_la_01',
      code: 'WH-LA-01',
      name: 'Los Angeles Gateway Facility',
      address: '450 Harbor Blvd, San Pedro',
      city: 'Los Angeles',
      state: 'CA',
      zip_code: '90731',
      capacity: 75000,
      current_occupancy: 51200,
      latitude: 34.0522,
      longitude: -118.2437,
      manager_id: 'usr_manager_02',
    },
    {
      id: 'wh_chi_01',
      code: 'WH-CHI-01',
      name: 'Midwest Regional Distribution Center',
      address: '88 O’Hare Cargo Rd',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60666',
      capacity: 60000,
      current_occupancy: 28900,
      latitude: 41.8781,
      longitude: -87.6298,
      manager_id: 'usr_admin_01',
    },
  ];

  // 3. PRODUCTS (Consistent IDs & SKUs: prod_[name] & SKU-[CAT]-[NUM])
  const products = [
    {
      id: 'prod_macbook_pro',
      sku: 'SKU-ELEC-1001',
      name: 'MacBook Pro 16" M3 Max',
      description: 'High performance laptop for logistics operations',
      category: 'Electronics',
      unit_price: 3499.0,
      weight_kg: 2.15,
    },
    {
      id: 'prod_dell_monitor',
      sku: 'SKU-ELEC-1002',
      name: 'Dell UltraSharp 32" 4K Monitor',
      description: 'Ergonomic IPS display panel',
      category: 'Electronics',
      unit_price: 899.99,
      weight_kg: 8.5,
    },
    {
      id: 'prod_ergonomic_chair',
      sku: 'SKU-FURN-2001',
      name: 'Herman Miller Aeron Chair',
      description: 'Executive ergonomic mesh office seating',
      category: 'Furniture',
      unit_price: 1450.0,
      weight_kg: 18.0,
    },
    {
      id: 'prod_iot_tracker',
      sku: 'SKU-IOT-3001',
      name: 'DLM Fleet GPS IoT Sensor',
      description: 'Real-time temperature and location telemetry beacon',
      category: 'Hardware',
      unit_price: 199.5,
      weight_kg: 0.35,
    },
  ];

  // 4. INVENTORY (Consistent IDs: inv_[index])
  const inventory = [
    { id: 'inv_01', warehouse_id: 'wh_nyc_01', product_id: 'prod_macbook_pro', quantity: 150, reorder_level: 25, reorder_quantity: 100 },
    { id: 'inv_02', warehouse_id: 'wh_nyc_01', product_id: 'prod_dell_monitor', quantity: 80, reorder_level: 15, reorder_quantity: 50 },
    { id: 'inv_03', warehouse_id: 'wh_la_01', product_id: 'prod_macbook_pro', quantity: 300, reorder_level: 50, reorder_quantity: 200 },
    { id: 'inv_04', warehouse_id: 'wh_la_01', product_id: 'prod_ergonomic_chair', quantity: 45, reorder_level: 10, reorder_quantity: 30 },
    { id: 'inv_05', warehouse_id: 'wh_chi_01', product_id: 'prod_iot_tracker', quantity: 1200, reorder_level: 200, reorder_quantity: 500 },
  ];

  // 5. ORDERS & PACKAGES (Consistent Tracking: DLM-[6DIGIT]-US & PKG-[CITY]-[CODE])
  const orders = [
    {
      id: 'ord_10001',
      tracking_number: 'DLM-892401-US',
      customer_id: 'usr_customer_01',
      origin_warehouse_id: 'wh_nyc_01',
      destination_address: '742 Evergreen Terrace',
      destination_city: 'Springfield',
      destination_zip: '01101',
      status: 'IN_TRANSIT',
      total_amount: 4398.99,
      driver_id: 'usr_driver_01',
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      id: 'ord_10002',
      tracking_number: 'DLM-991204-US',
      customer_id: 'usr_customer_01',
      origin_warehouse_id: 'wh_la_01',
      destination_address: '100 Universal City Plaza',
      destination_city: 'Los Angeles',
      destination_zip: '91608',
      status: 'OUT_FOR_DELIVERY',
      total_amount: 1450.0,
      driver_id: 'usr_driver_02',
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    },
    {
      id: 'ord_10003',
      tracking_number: 'DLM-441029-US',
      customer_id: 'usr_customer_01',
      origin_warehouse_id: 'wh_chi_01',
      destination_address: '233 S Wacker Dr',
      destination_city: 'Chicago',
      destination_zip: '60606',
      status: 'DELIVERED',
      total_amount: 798.0,
      driver_id: 'usr_driver_01',
      created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    },
  ];

  const packages = [
    {
      id: 'pkg_10001',
      order_id: 'ord_10001',
      package_code: 'PKG-NYC-892401',
      weight_kg: 10.65,
      dimensions: '40x30x20 cm',
      current_location: 'Interstate I-80 Rest Stop #4, PA',
      status: 'IN_TRANSIT',
    },
    {
      id: 'pkg_10002',
      order_id: 'ord_10002',
      package_code: 'PKG-LA-991204',
      weight_kg: 18.0,
      dimensions: '65x65x110 cm',
      current_location: 'Van #42 (Driver John Wick)',
      status: 'OUT_FOR_DELIVERY',
    },
  ];

  // 6. DRIVER TELEMETRY
  const driverLocations = [
    {
      id: 'loc_01',
      driver_id: 'usr_driver_01',
      latitude: 40.73061,
      longitude: -73.935242,
      speed_kmh: 68.5,
      heading: 180,
      recorded_at: new Date().toISOString(),
    },
    {
      id: 'loc_02',
      driver_id: 'usr_driver_02',
      latitude: 34.0537,
      longitude: -118.2427,
      speed_kmh: 42.0,
      heading: 90,
      recorded_at: new Date().toISOString(),
    },
  ];

  // 7. NOTIFICATIONS
  const notifications = [
    {
      id: 'notif_01',
      user_id: 'usr_admin_01',
      title: 'High Priority Shipment Dispatched',
      message: 'Order DLM-892401-US has exited WH-NYC-01 and is in transit.',
      type: 'INFO',
      is_read: false,
    },
    {
      id: 'notif_02',
      user_id: 'usr_manager_02',
      title: 'Low Stock Alert',
      message: 'Herman Miller Aeron Chair stock in WH-LA-01 dropped to 45 (Threshold: 10).',
      type: 'WARNING',
      is_read: false,
    },
  ];

  // 8. AUDIT LOGS
  const auditLogs = [
    {
      id: 'log_01',
      actor_id: 'usr_admin_01',
      action: 'SYSTEM_BOOTSTRAP',
      entity: 'SYSTEM',
      entity_id: 'sys_root',
      details: { event: 'Database seeded with standard consistent entity IDs.' },
    },
  ];

  seedInMemoryStore('users', users);
  seedInMemoryStore('warehouses', warehouses);
  seedInMemoryStore('products', products);
  seedInMemoryStore('inventory', inventory);
  seedInMemoryStore('orders', orders);
  seedInMemoryStore('packages', packages);
  seedInMemoryStore('driver_locations', driverLocations);
  seedInMemoryStore('notifications', notifications);
  seedInMemoryStore('audit_logs', auditLogs);

  await initializeDatabase();

  if (await checkDbConnection()) {
    try {
      for (const u of users) {
        if (!(await findById('users', u.id))) await insert('users', u);
      }
      for (const w of warehouses) {
        if (!(await findById('warehouses', w.id))) await insert('warehouses', w);
      }
      for (const p of products) {
        if (!(await findById('products', p.id))) await insert('products', p);
      }
      for (const inv of inventory) {
        if (!(await findById('inventory', inv.id))) await insert('inventory', inv);
      }
      for (const o of orders) {
        if (!(await findById('orders', o.id))) await insert('orders', o);
      }
      for (const pkg of packages) {
        if (!(await findById('packages', pkg.id))) await insert('packages', pkg);
      }
      for (const loc of driverLocations) {
        if (!(await findById('driver_locations', loc.id))) await insert('driver_locations', loc);
      }
      for (const n of notifications) {
        if (!(await findById('notifications', n.id))) await insert('notifications', n);
      }
      for (const l of auditLogs) {
        if (!(await findById('audit_logs', l.id))) await insert('audit_logs', l);
      }
      console.log('✅ PostgreSQL Database seeded successfully with standard consistent records.');
    } catch (err) {
      console.error('Error inserting seed data to Postgres:', err);
    }
  } else {
    console.log('✅ In-memory database seeded successfully with standard consistent records.');
  }
}

if (process.argv[1] && process.argv[1].includes('seedDb')) {
  seedDatabase().then(() => pool.end());
}
