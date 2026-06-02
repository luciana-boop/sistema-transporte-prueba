// FILE: src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../auth/auth.types';

// Extender el tipo Request para incluir el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      usuario?: JwtPayload;
    }
  }
}

export const verificarToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Token de acceso requerido',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ success: false, error: 'Configuración de seguridad inválida' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.usuario = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expirado' });
    } else {
      res.status(401).json({ success: false, error: 'Token inválido' });
    }
  }
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
