import { findMany, findById, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';

/**
 * Cache-Aside Pattern:
 * 1. Check Redis for 'warehouses:all'
 * 2. Return cached list if present
 * 3. Query Database on cache miss -> store in Redis with 600s TTL
 */
export async function getWarehouses() {
  const cacheKey = 'warehouses:all';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const warehouses = await findMany('warehouses');
  await cacheSet(cacheKey, warehouses, 600);
  return warehouses;
}

export async function getWarehouseById(id: string) {
  const wh = await findById('warehouses', id);
  if (!wh) throw { statusCode: 404, message: 'Warehouse not found' };
  return wh;
}

export async function createWarehouse(data: {
  code?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  capacity: number;
  current_occupancy?: number;
  latitude?: number;
  longitude?: number;
  manager_id?: string;
}) {
  const existingWarehouses = await findMany('warehouses');

  // Enforce consistent format WH-[CITY_3]-[INDEX_2_DIGITS] (e.g. WH-NYC-01, WH-MIA-01)
  let formattedCode = (data.code || '').trim().toUpperCase();
  
  if (!formattedCode || !formattedCode.startsWith('WH-')) {
    const cityClean = (data.city || 'HUB').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'HUB';
    const sameCityCount = existingWarehouses.filter(
      (w) => w.city && w.city.toLowerCase() === (data.city || '').toLowerCase()
    ).length + 1;
    formattedCode = `WH-${cityClean}-0${sameCityCount}`;
  }

  const id = `wh_${formattedCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  const newWh = {
    id,
    ...data,
    code: formattedCode,
    current_occupancy: data.current_occupancy || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const created = await insert('warehouses', newWh);

  // Invalidate warehouse list cache in Redis
  await cacheDel('warehouses:all');

  await publishEvent(KAFKA_TOPICS.WAREHOUSE_CREATED, {
    warehouseId: created.id,
    code: created.code,
    city: created.city,
  });

  return created;
}

export async function updateWarehouse(
  id: string,
  data: Partial<{
    code: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    capacity: number;
    current_occupancy: number;
    latitude: number;
    longitude: number;
    manager_id: string;
  }>
) {
  const existing = await findById('warehouses', id);
  if (!existing) throw { statusCode: 404, message: 'Warehouse facility not found' };

  const updated = await update('warehouses', id, {
    ...data,
    updated_at: new Date().toISOString(),
  });

  // Invalidate warehouse list cache in Redis
  await cacheDel('warehouses:all');

  return updated;
}
