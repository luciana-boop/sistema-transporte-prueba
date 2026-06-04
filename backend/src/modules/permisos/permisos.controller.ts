// FILE: backend/src/modules/permisos/permisos.controller.ts

import { Request, Response } from 'express';
import { permisosService } from './permisos.service';
import * as R from '../../utils/response';

export class PermisosController {

  // GET /api/permisos/:id
  // Devuelve el estado completo de permisos de un usuario (para el panel de admin)
  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const data = await permisosService.obtenerPermisosCompletos(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  // PUT /api/permisos/:id
  // Guarda (upsert) los permisos de un usuario
  // Body: { modulos: [{ key, habilitado }], acciones: [{ key, habilitado }] }
  async guardar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const { modulos, acciones } = req.body;

      if (!Array.isArray(modulos) || !Array.isArray(acciones)) {
        R.badRequest(res, 'modulos y acciones deben ser arrays');
        return;
      }

      await permisosService.guardarPermisos(id, { modulos, acciones });
      R.ok(res, null, 'Permisos actualizados correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('ADMIN')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const permisosController = new PermisosController();
