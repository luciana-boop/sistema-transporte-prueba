// FILE: src/modules/combustible/combustible.controller.ts

import { Request, Response } from 'express';
import { combustibleService } from './combustible.service';
import * as R from '../../utils/response';

export class CombustibleController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { vehiculoId, conductorId, desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await combustibleService.findAll({ vehiculoId, conductorId, desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async resumen(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await combustibleService.resumen({ desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await combustibleService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { vehiculoId, fecha, galones, monto } = req.body;
      if (!vehiculoId || !fecha || galones === undefined || monto === undefined) {
        R.badRequest(res, 'vehiculoId, fecha, galones y monto son requeridos'); return;
      }
      R.created(res, await combustibleService.create({
        ...req.body,
        vehiculoId: parseInt(vehiculoId),
        conductorId: req.body.conductorId ? parseInt(req.body.conductorId) : undefined,
        galones: parseFloat(galones),
        monto: parseFloat(monto),
        kilometraje: req.body.kilometraje ? parseFloat(req.body.kilometraje) : undefined,
      }), 'Carga registrada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await combustibleService.update(id, req.body), 'Registro actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await combustibleService.remove(id);
      R.ok(res, null, 'Registro eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const combustibleController = new CombustibleController();
