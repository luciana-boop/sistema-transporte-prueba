// FILE: src/modules/liquidaciones/liquidaciones.controller.ts
// CAMBIO: Agrega endpoint GET /pedidos-disponibles y manejo de pedidoIds en create/update.

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

  /**
   * GET /api/liquidaciones/pedidos-disponibles
   * Devuelve pedidos ACTIVOS sin liquidación asignada para poblar el selector del formulario.
   */
  async pedidosDisponibles(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await liquidacionesService.findPedidosDisponibles());
    } catch (e) { R.serverError(res, e); }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId, placaTracto, montoEntregado, fecha, detalles, pedidoIds } = req.body;

      if (!conductorId || !placaTracto || montoEntregado === undefined || !fecha) {
        R.badRequest(res, 'conductorId, placaTracto, montoEntregado y fecha son requeridos');
        return;
      }
      if (!Array.isArray(detalles)) {
        R.badRequest(res, 'detalles debe ser un array');
        return;
      }
      // pedidoIds es opcional; si viene debe ser un array de números
      if (pedidoIds !== undefined && !Array.isArray(pedidoIds)) {
        R.badRequest(res, 'pedidoIds debe ser un array');
        return;
      }

      R.created(
        res,
        await liquidacionesService.create({
          ...req.body,
          conductorId: parseInt(conductorId),
          montoEntregado: parseFloat(montoEntregado),
          toldo: req.body.toldo ? parseFloat(req.body.toldo) : undefined,
          detalles: detalles.map((d: any) => ({
            categoria: d.categoria,
            descripcion: d.descripcion,
            monto: parseFloat(d.monto),
          })),
          pedidoIds: pedidoIds ? (pedidoIds as any[]).map((id) => parseInt(id)) : [],
        }),
        'Liquidación creada',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('ya está asignado') || msg.includes('duplicados')) {
        R.badRequest(res, msg);
      } else {
        R.serverError(res, e);
      }
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const { pedidoIds, ...rest } = req.body;

      const updateData: any = { ...rest };
      if (pedidoIds !== undefined) {
        if (!Array.isArray(pedidoIds)) {
          R.badRequest(res, 'pedidoIds debe ser un array');
          return;
        }
        updateData.pedidoIds = (pedidoIds as any[]).map((id) => parseInt(id));
      }

      R.ok(res, await liquidacionesService.update(id, updateData), 'Liquidación actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else if (msg.includes('ya está asignado') || msg.includes('duplicados') || msg.includes('no encontrado')) {
        R.badRequest(res, msg);
      } else {
        R.serverError(res, e);
      }
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
