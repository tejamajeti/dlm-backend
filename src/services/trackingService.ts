import { findMany, insert } from '../db/crudHelper';
import { publishEvent } from '../events/eventBus';
import { KAFKA_TOPICS } from '../events/topics';

// In-Memory Telemetry Cache to eliminate DB read bottleneck
const latestLocationCache = new Map<string, any>();
const lastDbWriteTimestamp = new Map<string, number>();

// DB Persistence Throttling: Write to PostgreSQL at most once every 10 seconds per driver
const MIN_DB_WRITE_INTERVAL_MS = 10000;

export async function updateDriverLocation(data: {
  driver_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading?: number;
}) {
  const locId = `loc_${Date.now()}`;
  const now = Date.now();

  const record = {
    id: locId,
    driver_id: data.driver_id,
    latitude: data.latitude,
    longitude: data.longitude,
    speed_kmh: data.speed_kmh || 0,
    heading: data.heading || 0,
    recorded_at: new Date(now).toISOString(),
  };

  // 1. Update In-Memory Telemetry Cache for instant zero-latency reads
  latestLocationCache.set(data.driver_id, record);

  // 2. Publish Real-Time Event to Kafka / EventBus immediately
  await publishEvent(KAFKA_TOPICS.DRIVER_LOCATION_UPDATED, {
    driverId: data.driver_id,
    latitude: data.latitude,
    longitude: data.longitude,
    speed: record.speed_kmh,
  });

  // 3. Throttled DB Write: Only insert to database if >10s since last write for this driver
  const lastWrite = lastDbWriteTimestamp.get(data.driver_id) || 0;
  if (now - lastWrite >= MIN_DB_WRITE_INTERVAL_MS) {
    lastDbWriteTimestamp.set(data.driver_id, now);
    try {
      await insert('driver_locations', record);
    } catch (err) {
      console.error('Error inserting driver location into DB:', err);
    }
  }

  return record;
}

export async function getDriverLatestLocation(driverId: string) {
  // 1. Serve from In-Memory Cache first (0 DB queries)
  if (latestLocationCache.has(driverId)) {
    return latestLocationCache.get(driverId);
  }

  // 2. Fallback to DB query if not in cache
  const locs = await findMany('driver_locations', { driver_id: driverId }, { orderBy: 'recorded_at DESC', limit: 1 });
  if (locs.length > 0) {
    latestLocationCache.set(driverId, locs[0]);
    return locs[0];
  }
  return null;
}
