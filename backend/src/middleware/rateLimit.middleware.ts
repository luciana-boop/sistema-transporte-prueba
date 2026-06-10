// FILE: backend/src/middleware/rateLimit.middleware.ts

import rateLimit from 'express-rate-limit';

// Limita intentos de login para mitigar fuerza bruta sobre credenciales.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.' },
});

// Límite global de requests por IP para mitigar abuso/DoS básico.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes. Intente nuevamente en unos minutos.' },
});
