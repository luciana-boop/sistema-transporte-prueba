// FILE: backend/src/middleware/csrf.middleware.ts
// Protección CSRF mediante el patrón "double submit cookie": el login emite
// una cookie `csrf_token` (no httpOnly, legible por JS) y el frontend debe
// reenviar su valor en el header `x-csrf-token` en cada mutación. Como un
// sitio atacante no puede leer cookies de otro origen, no puede reproducir
// el header aunque el navegador adjunte la cookie automáticamente.

import { Request, Response, NextFunction } from 'express';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const verificarCsrf = (req: Request, res: Response, next: NextFunction): void => {
  if (METODOS_SEGUROS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ success: false, error: 'Token CSRF inválido o ausente' });
    return;
  }

  next();
};
