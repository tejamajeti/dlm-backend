import { findMany, insert, update } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

export async function getInventory(warehouseId?: string) {
  const conditions = warehouseId ? { warehouse_id: warehouseId } : {};
  const items = await findMany('inventory', conditions);
  const products = await findMany('products');
  const warehouses = await findMany('warehouses');

  return items.map((inv) => ({
    ...inv,
    product: products.find((p) => p.id === inv.product_id) || null,
    warehouse: warehouses.find((w) => w.id === inv.warehouse_id) || null,
  }));
}

export async function updateInventoryStock(
  id: string,
  data: { quantity?: number; reorder_level?: number },
  actorId: string
) {
  const updated = await update('inventory', id, data);
  if (!updated) throw { statusCode: 404, message: 'Inventory item not found' };

  await publishEvent(KAFKA_TOPICS.INVENTORY_UPDATED, {
    inventoryId: id,
    newQuantity: updated.quantity,
    reorderLevel: updated.reorder_level,
    actorId,
  });

  return updated;
}
