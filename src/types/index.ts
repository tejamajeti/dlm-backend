export type UserRole = 'Admin' | 'Warehouse Manager' | 'Driver' | 'Customer' | 'Operator';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Warehouse {
  id: string;
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
  manager_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  unit_price: number;
  weight_kg: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryItem {
  id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reorder_level: number;
  reorder_quantity: number;
  updated_at?: string;
  product?: Product;
}

export type OrderStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface Package {
  id: string;
  order_id: string;
  package_code: string;
  weight_kg: number;
  dimensions?: string;
  current_location: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  tracking_number: string;
  customer_id?: string | null;
  origin_warehouse_id: string;
  destination_address: string;
  destination_city: string;
  destination_zip: string;
  status: OrderStatus;
  total_amount: number;
  driver_id?: string | null;
  created_at: string;
  updated_at: string;
  packages?: Package[];
}

export interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading?: number;
  recorded_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  entity: string;
  entity_id: string;
  details: any;
  created_at: string;
}

export interface DashboardMetrics {
  overview: {
    totalUsers: number;
    totalWarehouses: number;
    totalOrders: number;
    activeShipments: number;
    deliveredShipments: number;
    totalRevenue: number;
  };
  activeOrders: Order[];
  recentAuditLogs: AuditLog[];
}

export interface KafkaEventPayload {
  eventId: string;
  timestamp: string;
  topic: string;
  data: Record<string, any>;
}
