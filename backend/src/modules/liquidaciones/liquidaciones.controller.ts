// FILE: src/modules/liquidaciones/liquidaciones.controller.ts

import { Request, Response } from 'express';
import { liquidacionesService } from './liquidaciones.service';
import * as R from '../../utils/response';

export class LiquidacionesController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId, desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await liquidacionesService.findAll({ conductorId, desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await liquidacionesService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId, placaTracto, montoEntregado, fecha, detalles } = req.body;
      if (!conductorId || !placaTracto || montoEntregado === undefined || !fecha) {
        R.badRequest(res, 'conductorId, placaTracto, montoEntregado y fecha son requeridos'); return;
      }
      if (!Array.isArray(detalles)) {
        R.badRequest(res, 'detalles debe ser un array'); return;
      }
      R.created(res, await liquidacionesService.create({
        ...req.body,
        conductorId: parseInt(conductorId),
        montoEntregado: parseFloat(montoEntregado),
        toldo: req.body.toldo ? parseFloat(req.body.toldo) : undefined,
        detalles: detalles.map((d: any) => ({
          categoria: d.categoria,
          descripcion: d.descripcion,
          monto: parseFloat(d.monto),
        })),
      }), 'Liquidación creada');
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
      R.ok(res, await liquidacionesService.update(id, req.body), 'Liquidación actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await liquidacionesService.remove(id);
      R.ok(res, null, 'Liquidación eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const liquidacionesController = new LiquidacionesController();
