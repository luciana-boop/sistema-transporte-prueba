// FILE: src/modules/liquidaciones/liquidaciones.controller.ts
// CAMBIOS v2 (P3):
//   - cajasAbiertas(): devuelve cajas abiertas disponibles para pago
//   - pagar(): pago total de liquidación desde caja abierta
//   - reintegro(): registra egreso en caja cuando la empresa entrega dinero adicional al conductor
//   - devolucion(): registra ingreso en caja cuando el conductor devuelve dinero sobrante
//   - historialFinanciero(): movimientos financieros de la liquidación
// CAMBIOS v3 (FLUJO 2 ETAPAS):
//   - rendir(): registra/reemplaza gastos reales del viaje, recalcula totales

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

  async pedidosDisponibles(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await liquidacionesService.findPedidosDisponibles());
    } catch (e) { R.serverError(res, e); }
  }

  // ── P3: cajas abiertas ────────────────────────────────────────────────────────
  async cajasAbiertas(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await liquidacionesService.getCajasAbiertas());
    } catch (e) { R.serverError(res, e); }
  }

  // ── P3: pago total desde caja ─────────────────────────────────────────────────
  async pagar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { cajaId, observaciones } = req.body;
      if (!cajaId) { R.badRequest(res, 'cajaId es requerido'); return; }

      const result = await liquidacionesService.pagarLiquidacion(
        { liquidacionId: id, cajaId: parseInt(cajaId), observaciones },
        req.usuario!.id,
      );
      R.ok(res, result, 'Liquidación pagada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('ya fue pagada') || msg.includes('cerrada')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  // ── P3: reintegro ─────────────────────────────────────────────────────────────
  async reintegro(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { cajaId, monto, concepto, observaciones } = req.body;
      if (!cajaId || !monto) { R.badRequest(res, 'cajaId y monto son requeridos'); return; }

      const result = await liquidacionesService.registrarReintegro(
        {
          liquidacionId: id,
          cajaId: parseInt(cajaId),
          monto: parseFloat(monto),
          concepto,
          observaciones,
        },
        req.usuario!.id,
      );
      R.ok(res, result, 'Reintegro registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrada') || msg.includes('Solo se puede') ||
        msg.includes('cerrada') || msg.includes('no tiene monto')
      ) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  // ── P3: devolución ───────────────────────────────────────────────────────────
  async devolucion(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { cajaId, monto, concepto, observaciones } = req.body;
      if (!cajaId || !monto) { R.badRequest(res, 'cajaId y monto son requeridos'); return; }

      const result = await liquidacionesService.registrarDevolucion(
        {
          liquidacionId: id,
          cajaId: parseInt(cajaId),
          monto: parseFloat(monto),
          concepto,
          observaciones,
        },
        req.usuario!.id,
      );
      R.ok(res, result, 'Devolución registrada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrada') || msg.includes('Solo se puede') ||
        msg.includes('cerrada') || msg.includes('no tiene monto')
      ) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  // ── P3: historial financiero ─────────────────────────────────────────────────
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
      const { conductorId, placaTracto, montoEntregado, fecha, detalles, pedidoIds } = req.body;

      if (!conductorId || !placaTracto || montoEntregado === undefined || !fecha) {
        R.badRequest(res, 'conductorId, placaTracto, montoEntregado y fecha son requeridos');
        return;
      }
      // detalles es opcional; si se envía debe ser un array
      if (detalles !== undefined && !Array.isArray(detalles)) {
        R.badRequest(res, 'detalles debe ser un array');
        return;
      }
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
          detalles: Array.isArray(detalles)
            ? detalles.map((d: any) => ({
                categoria: d.categoria,
                descripcion: d.descripcion,
                monto: parseFloat(d.monto),
              }))
            : [],
          pedidoIds: pedidoIds ? (pedidoIds as any[]).map((id) => parseInt(id)) : [],
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

  // ── v3: rendir — registra/reemplaza gastos del viaje ────────────────────────
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
      R.ok(res, result, 'Liquidación rendida correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrada') ||
        msg.includes('ya pagada') ||
        msg.includes('al menos un gasto')
      ) {
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
