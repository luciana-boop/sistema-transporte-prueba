// FILE: src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../auth/auth.types';
import prisma from '../prisma/client';
import { dentroDeHorario } from '../utils/horario';

// Extender el tipo Request para incluir el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      usuario?: JwtPayload;
    }
  }
}

export const verificarToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const tokenHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const token = req.cookies?.token || tokenHeader;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Token de acceso requerido',
    });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ success: false, error: 'Configuración de seguridad inválida' });
    return;
  }

  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, secret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expirado' });
    } else {
      res.status(401).json({ success: false, error: 'Token inválido' });
    }
    return;
  }

  req.usuario = payload;

  // Corta la sesión si el usuario tiene restricción de horario activa y ya
  // está fuera de la ventana permitida (ej. login dentro de horario, pero la
  // sesión sigue viva cuando el horario terminó). ADMIN nunca se restringe.
  if (payload.rol !== 'ADMIN') {
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { id: payload.id },
        select: { restriccionHorarioActiva: true, diasPermitidos: true, horaInicio: true, horaFin: true },
      });

      if (usuario?.restriccionHorarioActiva && !dentroDeHorario(usuario)) {
        await prisma.logActividad.create({
          data: {
            usuarioId: payload.id,
            accion: 'ACCESO_DENEGADO_HORARIO',
            modulo: 'AUTH',
            detalle: `Intento de acceso fuera del horario permitido (${req.method} ${req.originalUrl})`,
            ip: req.ip,
          },
        });
        res.status(403).json({ success: false, error: 'Acceso fuera del horario permitido. Contacte al administrador.' });
        return;
      }
    } catch (error) {
      console.error('[verificarToken] Error al verificar horario de acceso', error);
      res.status(500).json({ success: false, error: 'Error al verificar acceso' });
      return;
    }
  }

  next();
};

export const soloAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.usuario) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }

  if (req.usuario.rol !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requiere rol ADMIN',
    });
    return;
  }

  next();
};

export const adminOSecretario = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.usuario) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }

  if (!['ADMIN', 'SECRETARIO'].includes(req.usuario.rol)) {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado',
    });
    return;
  }

  next();
};
