// FILE: src/modules/mantenimiento/mantenimiento.controller.ts

import { Request, Response } from 'express';
import { mantenimientoService } from './mantenimiento.service';
import * as R from '../../utils/response';

export class MantenimientoController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, desde, hasta, vehiculoId, motivoCodigo, search } = req.query as Record<string, string>;
      R.ok(res, await mantenimientoService.listar({
        estado: estado as 'por_relacionar' | 'relacionado' | undefined,
        desde, hasta, vehiculoId, motivoCodigo, search,
      }));
    } catch (e) { R.serverError(res, e); }
  }

  async relacionar(req: Request, res: Response): Promise<void> {
    try {
      const movimientoId = parseInt(req.params.movimientoId);
      if (isNaN(movimientoId)) { R.badRequest(res, 'ID inválido'); return; }
      const { vehiculoId, conductorId, motivoCodigo, descripcion } = req.body;
      if (!vehiculoId || !motivoCodigo) {
        R.badRequest(res, 'vehiculoId y motivoCodigo son requeridos'); return;
      }
      const data = await mantenimientoService.relacionar(movimientoId, {
        vehiculoId: parseInt(vehiculoId),
        conductorId: conductorId ? parseInt(conductorId) : undefined,
        motivoCodigo,
        descripcion,
      }, req.usuario!.id);
      R.ok(res, data, 'Gasto relacionado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('Solo se pueden') || msg.includes('anulado') || msg.includes('inválido')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }
}

export const mantenimientoController = new MantenimientoController();
