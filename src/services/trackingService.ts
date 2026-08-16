import { findMany, insert } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

export async function updateDriverLocation(data: {
  driver_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading?: number;
}) {
  const locId = `loc_${Date.now()}`;
  const record = {
    id: locId,
    driver_id: data.driver_id,
    latitude: data.latitude,
    longitude: data.longitude,
    speed_kmh: data.speed_kmh || 0,
    heading: data.heading || 0,
    recorded_at: new Date().toISOString(),
  };

  const created = await insert('driver_locations', record);

  await publishEvent(KAFKA_TOPICS.DRIVER_LOCATION_UPDATED, {
    driverId: data.driver_id,
    latitude: data.latitude,
    longitude: data.longitude,
    speed: record.speed_kmh,
  });

  return created;
}

export async function getDriverLatestLocation(driverId: string) {
  const locs = await findMany('driver_locations', { driver_id: driverId }, { orderBy: 'recorded_at DESC', limit: 1 });
  return locs.length > 0 ? locs[0] : null;
}
