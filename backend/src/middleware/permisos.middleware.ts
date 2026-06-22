// FILE: backend/src/middleware/permisos.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { permisosService } from '../modules/permisos/permisos.service';
import { ModuloKey, AccionKey, MODULOS_META, ACCIONES_META } from '../config/permisos.config';

// ─── Middleware: verificar acceso a módulo ────────────────────────────────────
// Uso en rutas: router.use(verificarToken, verificarModulo('facturacion'))
// El middleware soloAdmin / adminOSecretario se puede mantener o reemplazar por este.
// Si el usuario es ADMIN pasa directo (el service lo garantiza).
export const verificarModulo = (moduloKey: ModuloKey) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    try {
      const tiene = await permisosService.tienePermisoModulo(usuarioId, moduloKey);

      if (!tiene) {
        const label = MODULOS_META[moduloKey]?.label ?? moduloKey;
        res.status(403).json({
          success: false,
          error: `No tenés permiso para acceder al módulo: ${label}`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[verificarModulo]', error);
      res.status(500).json({ success: false, error: 'Error al verificar permisos' });
    }
  };
};

// ─── Middleware: verificar permiso de acción especial ─────────────────────────
// Uso en rutas de anulación:
//   router.patch('/:id/anular', verificarToken, verificarAccion('anular_factura'), ...)
export const verificarAccion = (accionKey: AccionKey) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }

    try {
      const tiene = await permisosService.tienePermisoAccion(usuarioId, accionKey);

      if (!tiene) {
        const label = ACCIONES_META[accionKey]?.label ?? accionKey;
        res.status(403).json({
          success: false,
          error: `No tenés permiso para ejecutar: ${label}`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[verificarAccion]', error);
      res.status(500).json({ success: false, error: 'Error al verificar permisos' });
    }
  };
};
