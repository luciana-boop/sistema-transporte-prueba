// FILE: src/middleware/logger.middleware.ts

import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';

export const logActividad = (modulo: string, accion: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuarioId = req.usuario?.id;
    const ip = req.ip || req.socket.remoteAddress || 'desconocida';

    if (usuarioId) {
      try {
        await prisma.logActividad.create({
          data: {
            usuarioId,
            accion,
            modulo,
            detalle: `${req.method} ${req.originalUrl}`,
            ip,
          },
        });
      } catch {
        // No bloquear la request si falla el log
        console.error('Error al registrar actividad');
      }
    }

    next();
  };
};
