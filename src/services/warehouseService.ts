import { findMany, findById, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

export async function getWarehouses() {
  return await findMany('warehouses');
}

export async function getWarehouseById(id: string) {
  const wh = await findById('warehouses', id);
  if (!wh) throw { statusCode: 404, message: 'Warehouse not found' };
  return wh;
}

export async function createWarehouse(data: {
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  capacity: number;
  latitude?: number;
  longitude?: number;
  manager_id?: string;
}) {
  const id = `wh_${data.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const newWh = {
    id,
    ...data,
    current_occupancy: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const created = await insert('warehouses', newWh);

  await publishEvent(KAFKA_TOPICS.WAREHOUSE_CREATED, {
    warehouseId: created.id,
    code: created.code,
    city: created.city,
  });

  return created;
}
