import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index';

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User identity context not found. Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Access denied. Role '${req.user.role}' is not authorized for this resource. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
