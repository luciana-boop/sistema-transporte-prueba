// FILE: src/modules/conductores/conductores.controller.ts

import { Request, Response } from 'express';
import { conductoresService } from './conductores.service';
import * as R from '../../utils/response';

export class ConductoresController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { activo, search, page, limit } = req.query as Record<string, string>;
      R.ok(res, await conductoresService.findAll({ activo, search, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await conductoresService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Conductor no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { nombre, dni, licencia, vencimientoLicencia, telefono, direccion, observaciones } = req.body;
      if (!nombre || !dni || !licencia || !vencimientoLicencia) {
        R.badRequest(res, 'nombre, dni, licencia y vencimientoLicencia son requeridos'); return;
      }
      R.created(res, await conductoresService.create({ nombre, dni, licencia, vencimientoLicencia, telefono, direccion, observaciones }), 'Conductor creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await conductoresService.update(id, req.body), 'Conductor actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Conductor no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está registrado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await conductoresService.remove(id);
      R.ok(res, null, 'Conductor eliminado/desactivado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Conductor no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const conductoresController = new ConductoresController();
