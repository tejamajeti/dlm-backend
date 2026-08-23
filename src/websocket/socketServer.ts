import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthenticatedUser } from '../types/index';

const JWT_SECRET = process.env.JWT_SECRET || 'dlm_super_secret_jwt_key_2026_production_ready';

let io: Server | null = null;

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
  };
}

export function initSocketServer(httpServer: HTTPServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT Authentication Middleware for WebSockets
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (socket.handshake.query?.token as string);

      if (!token) {
        // Allow anonymous connections for public dashboard/tracking if token missing
        return next();
      }

      const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
      socket.data.user = decoded;
      next();
    } catch (err: any) {
      console.warn('⚠️ WebSocket JWT Verification Warning:', err.message || err);
      // Proceed gracefully without authenticated user data
      next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.data.user;

    // Default join global telemetry & dashboard room
    socket.join('dashboard');

    if (user) {
      // Join private user room
      socket.join(`user:${user.id}`);

      // Join role-specific room
      if (user.role) {
        socket.join(`role:${user.role}`);
      }
    }

    // Client join custom channel (e.g. tracking standard order DLM-892401-US)
    socket.on('subscribe:shipment', (trackingNumber: string) => {
      if (trackingNumber) {
        socket.join(`shipment:${trackingNumber}`);
      }
    });

    socket.on('unsubscribe:shipment', (trackingNumber: string) => {
      if (trackingNumber) {
        socket.leave(`shipment:${trackingNumber}`);
      }
    });
  });

  console.log('✅ Real-time WSS Socket.IO Gateway Initialized');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO is not initialized! Call initSocketServer first.');
  }
  return io;
}

// --------------------------------------------------------------------------
// Real-Time Event Emission Helpers
// --------------------------------------------------------------------------

/** Send to a specific authenticated user */
export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

/** Send to all users of a specific role (e.g. "Warehouse Manager", "Driver", "Admin") */
export function emitToRole(role: string, event: string, data: any) {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
}

/** Send to all subscribers watching a tracking number */
export function emitToShipment(trackingNumber: string, event: string, data: any) {
  if (io) {
    io.to(`shipment:${trackingNumber}`).emit(event, data);
  }
}

/** Broadcast to the global dashboard room */
export function emitToDashboard(event: string, data: any) {
  if (io) {
    io.to('dashboard').emit(event, data);
  }
}

/** Broadcast to all connected clients */
export function broadcastEvent(event: string, data: any) {
  if (io) {
    io.emit(event, data);
  }
}
