import { pool, checkDbConnection } from './connection';
import { PoolClient } from 'pg';

// In-Memory Fallback DB Store for standalone execution when Postgres container is not running
const inMemoryStore: Record<string, any[]> = {};
let isDbConnected: boolean | null = null;

async function isConnected(): Promise<boolean> {
  if (isDbConnected === null) {
    isDbConnected = await checkDbConnection();
    if (!isDbConnected) {
      console.warn('⚠️ PostgreSQL instance not reachable. Operating with resilient in-memory storage fallback.');
    }
  }
  return isDbConnected;
}

/**
 * Execute raw SQL query with parameters
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    if (await isConnected()) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    }
  } catch (error) {
    console.error('Postgres query error:', error);
  }
  return [];
}

/**
 * Execute raw SQL query expecting a single row
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Generic CRUD: Find entity by ID
 */
export async function findById<T = any>(table: string, id: string | number, idColumn: string = 'id'): Promise<T | null> {
  if (await isConnected()) {
    const sql = `SELECT * FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`;
    return await queryOne<T>(sql, [id]);
  }
  const collection = inMemoryStore[table] || [];
  return (collection.find((item) => String(item[idColumn]) === String(id)) as T) || null;
}

/**
 * Generic CRUD: Find multiple entities matching conditions
 */
export async function findMany<T = any>(
  table: string,
  conditions: Record<string, any> = {},
  options: { orderBy?: string; limit?: number; offset?: number } = {}
): Promise<T[]> {
  if (await isConnected()) {
    const keys = Object.keys(conditions);
    const whereClause = keys.length > 0
      ? 'WHERE ' + keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ')
      : '';
    
    const orderClause = options.orderBy ? `ORDER BY ${options.orderBy}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const sql = `SELECT * FROM ${table} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`.trim();
    const params = keys.map((key) => conditions[key]);
    return await query<T>(sql, params);
  }

  let items = [...(inMemoryStore[table] || [])];
  for (const [key, value] of Object.entries(conditions)) {
    items = items.filter((item) => String(item[key]) === String(value));
  }
  if (options.limit) {
    const offset = options.offset || 0;
    items = items.slice(offset, offset + options.limit);
  }
  return items as T[];
}

/**
 * Generic CRUD: Insert record into database table
 */
export async function insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
  if (!data.id && !data.created_at) {
    data.created_at = new Date().toISOString();
    data.updated_at = new Date().toISOString();
  }

  if (await isConnected()) {
    const keys = Object.keys(data);
    const cols = keys.join(', ');
    const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${table} (${cols}) VALUES (${vals}) RETURNING *`;
    const rows = await query<T>(sql, Object.values(data));
    return rows[0];
  }

  if (!inMemoryStore[table]) {
    inMemoryStore[table] = [];
  }
  inMemoryStore[table].push(data);
  return data as T;
}

/**
 * Generic CRUD: Update record in database table by ID
 */
export async function update<T = any>(
  table: string,
  id: string | number,
  data: Record<string, any>,
  idColumn: string = 'id'
): Promise<T | null> {
  data.updated_at = new Date().toISOString();

  if (await isConnected()) {
    const keys = Object.keys(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = $1 RETURNING *`;
    const params = [id, ...Object.values(data)];
    const rows = await query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  const collection = inMemoryStore[table] || [];
  const index = collection.findIndex((item) => String(item[idColumn]) === String(id));
  if (index !== -1) {
    inMemoryStore[table][index] = { ...inMemoryStore[table][index], ...data };
    return inMemoryStore[table][index] as T;
  }
  return null;
}

/**
 * Generic CRUD: Delete record by ID
 */
export async function deleteById(table: string, id: string | number, idColumn: string = 'id'): Promise<boolean> {
  if (await isConnected()) {
    const sql = `DELETE FROM ${table} WHERE ${idColumn} = $1`;
    await query(sql, [id]);
    return true;
  }

  if (inMemoryStore[table]) {
    inMemoryStore[table] = inMemoryStore[table].filter((item) => String(item[idColumn]) !== String(id));
    return true;
  }
  return false;
}

/**
 * Execute atomic transaction
 */
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  if (await isConnected()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  // Fallback transaction
  return await callback(null as any);
}

/**
 * Seeding helper to load items into memory store directly
 */
export function seedInMemoryStore(table: string, records: any[]) {
  inMemoryStore[table] = records;
}

/**
 * Get all records from in-memory store
 */
export function getInMemoryStore(table: string) {
  return inMemoryStore[table] || [];
}
