// FILE: src/modules/liquidaciones/liquidaciones.controller.ts
// Flujo v4: CREADA → PAGADA → RENDIDA → CERRADA
//   pagar()   → CREADA→PAGADA  (requiere cajaId, montoPagado opcional)
//   rendir()  → PAGADA→RENDIDA (requiere detalles de gastos)
//   cerrar()  → RENDIDA→CERRADA (calcula y registra devolución/reintegro)

import { Request, Response } from 'express';
import { liquidacionesService } from './liquidaciones.service';
import * as R from '../../utils/response';

export class LiquidacionesController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId, desde, hasta, sinCombustible } = req.query as Record<string, string>;
      R.ok(res, await liquidacionesService.findAll({ conductorId, desde, hasta, sinCombustible }));
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

  async pedidosDisponibles(_req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await liquidacionesService.findPedidosDisponibles());
    } catch (e) { R.serverError(res, e); }
  }

  async cajasAbiertas(_req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await liquidacionesService.getCajasAbiertas());
    } catch (e) { R.serverError(res, e); }
  }

  // PASO 2: pagar liquidación (CREADA→PAGADA)
  async pagar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { cajaId, montoPagado, fechaPago } = req.body;
      if (!cajaId) { R.badRequest(res, 'cajaId es requerido'); return; }

      const result = await liquidacionesService.pagar(
        {
          liquidacionId: id,
          cajaId: parseInt(cajaId),
          montoPagado: montoPagado ? parseFloat(montoPagado) : undefined,
          fechaPago,
        },
        req.usuario!.id,
      );
      R.ok(res, result, 'Liquidación pagada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('ya fue') || msg.includes('cerrada') || msg.includes('ya está')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  // PASO 3: rendir gastos (PAGADA→RENDIDA)
  async rendir(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const { detalles, observaciones } = req.body;
      if (!Array.isArray(detalles) || detalles.length === 0) {
        R.badRequest(res, 'detalles es requerido y debe contener al menos un elemento');
        return;
      }

      const result = await liquidacionesService.rendir(id, {
        detalles: detalles.map((d: any) => ({
          categoria: d.categoria,
          descripcion: d.descripcion,
          monto: parseFloat(d.monto),
        })),
        observaciones,
      });
      R.ok(res, result, 'Gastos rendidos correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('al menos un gasto') || msg.includes('Debe pagar') || msg.includes('ya fueron') || msg.includes('cerrada')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  // PASO 4: cerrar liquidación (RENDIDA→CERRADA)
  async cerrar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { cajaId, fecha } = req.body;
      if (!cajaId) { R.badRequest(res, 'cajaId es requerido'); return; }

      const result = await liquidacionesService.cerrar(
        { liquidacionId: id, cajaId: parseInt(cajaId), fecha },
        req.usuario!.id,
      );
      R.ok(res, result, 'Liquidación cerrada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('ya está') || msg.includes('Debe rendir') || msg.includes('cerrada')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  async historialFinanciero(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await liquidacionesService.getHistorialFinanciero(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId, placaTracto, montoEntregado, fecha } = req.body;
      if (!conductorId || !placaTracto || montoEntregado === undefined || !fecha) {
        R.badRequest(res, 'conductorId, placaTracto, montoEntregado y fecha son requeridos');
        return;
      }
      const { pedidoIds } = req.body;
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
          detalles: [],
          pedidoIds: pedidoIds ? (pedidoIds as any[]).map((id: any) => parseInt(id)) : [],
        }),
        'Liquidación creada',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('ya está asignado') || msg.includes('duplicados')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const { pedidoIds, ...rest } = req.body;
      const updateData: any = { ...rest };
      if (pedidoIds !== undefined) {
        if (!Array.isArray(pedidoIds)) { R.badRequest(res, 'pedidoIds debe ser un array'); return; }
        updateData.pedidoIds = (pedidoIds as any[]).map((id) => parseInt(id));
      }

      R.ok(res, await liquidacionesService.update(id, updateData), 'Liquidación actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Liquidación no encontrada') R.notFound(res, msg);
      else if (msg.includes('ya asignado') || msg.includes('duplicados') || msg.includes('no encontrado') || msg.includes('pagada')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
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
      else if (msg.includes('pagada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const liquidacionesController = new LiquidacionesController();
