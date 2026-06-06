// FILE: src/modules/caja/caja.controller.ts
// CHAT 9: Agrega 3 endpoints de liquidaciones:
//   GET  /caja/liquidaciones-pendientes
//   POST /caja/pagar-liquidacion
//   POST /caja/liquidaciones/:liquidacionId/anular-pago

import { Request, Response } from 'express';
import { cajaService } from './caja.service';
import { TipoMovimientoCaja } from '../../utils/enums';
import * as R from '../../utils/response';

export class CajaController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, usuarioId, desde, hasta } = req.query as Record<string, string>;
      const data = await cajaService.findAll({ estado, usuarioId, desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async cajaActual(req: Request, res: Response): Promise<void> {
    try {
      const data = await cajaService.cajaActual(req.usuario!.id);
      R.ok(res, data ?? null);
    } catch (e) { R.serverError(res, e); }
  }

  async abrir(req: Request, res: Response): Promise<void> {
    try {
      const { saldoApertura, nombre, observaciones } = req.body;
      if (saldoApertura === undefined) { R.badRequest(res, 'saldoApertura es requerido'); return; }
      const data = await cajaService.abrir(
        { saldoApertura: parseFloat(saldoApertura), nombre, observaciones },
        req.usuario!.id
      );
      R.created(res, data, 'Caja abierta correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async cerrar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { saldoCierre, observaciones } = req.body;
      if (saldoCierre === undefined) { R.badRequest(res, 'saldoCierre es requerido'); return; }
      const data = await cajaService.cerrar(
        id,
        { saldoCierre: parseFloat(saldoCierre), observaciones },
        req.usuario!.id
      );
      R.ok(res, data, 'Caja cerrada correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('ya está') || msg.includes('No puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async registrarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { tipo, monto, concepto, fecha, referencia } = req.body;
      if (!tipo || !monto || !concepto) { R.badRequest(res, 'tipo, monto y concepto son requeridos'); return; }
      if (!Object.values(TipoMovimientoCaja).includes(tipo)) {
        R.badRequest(res, `tipo inválido. Valores: ${Object.values(TipoMovimientoCaja).join(', ')}`); return;
      }
      const data = await cajaService.registrarMovimiento(id, { tipo, monto: parseFloat(monto), concepto, fecha, referencia }, req.usuario!.id);
      R.created(res, data, 'Movimiento registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('cerrada') || msg.includes('No puede') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async getMovimientos(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { desde, hasta, tipo } = req.query as Record<string, string>;
      const data = await cajaService.getMovimientos(id, { desde, hasta, tipo });
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('inválida') || msg.includes('inválido')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async getMovimientosGlobal(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, tipo, cajaId } = req.query as Record<string, string>;
      const data = await cajaService.getMovimientosGlobal({ desde, hasta, tipo, cajaId });
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('inválida') || msg.includes('inválido')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async editarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const movimientoId = parseInt(req.params.movimientoId);
      if (isNaN(movimientoId)) { R.badRequest(res, 'ID inválido'); return; }
      const { monto, concepto, fecha, referencia } = req.body;
      const dto: any = {};
      if (monto !== undefined)      dto.monto      = parseFloat(monto);
      if (concepto !== undefined)   dto.concepto   = concepto;
      if (fecha !== undefined)      dto.fecha      = fecha;
      if (referencia !== undefined) dto.referencia = referencia;
      const data = await cajaService.editarMovimiento(movimientoId, dto, req.usuario!.id);
      R.ok(res, data, 'Movimiento actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else if (msg.includes('No se puede') || msg.includes('No puede') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anularMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const movimientoId = parseInt(req.params.movimientoId);
      if (isNaN(movimientoId)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.anularMovimiento(movimientoId, req.usuario!.id);
      R.ok(res, data, 'Movimiento anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else if (msg.includes('ya está') || msg.includes('No se pueden') || msg.includes('No puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cajaService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Caja eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('Solo') || msg.includes('abierta')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── CHAT 9: Liquidaciones pendientes ──────────────────────────────────────

  async liquidacionesPendientes(req: Request, res: Response): Promise<void> {
    try {
      const data = await cajaService.liquidacionesPendientes();
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async pagarLiquidacion(req: Request, res: Response): Promise<void> {
    try {
      const { liquidacionId, cuentaId, monedaId, tipoPagoId, observaciones } = req.body;
      if (!liquidacionId) { R.badRequest(res, 'liquidacionId es requerido'); return; }
      if (!cuentaId)      { R.badRequest(res, 'Debe seleccionar una cuenta'); return; }
      if (!monedaId)      { R.badRequest(res, 'Debe seleccionar una moneda'); return; }

      const data = await cajaService.pagarLiquidacion(
        {
          liquidacionId: parseInt(liquidacionId),
          cuentaId: parseInt(cuentaId),
          monedaId: parseInt(monedaId),
          tipoPagoId: tipoPagoId ? parseInt(tipoPagoId) : undefined,
          observaciones,
        },
        req.usuario!.id
      );
      R.created(res, data, 'Liquidación pagada correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrada') ||
        msg.includes('PENDIENTE') ||
        msg.includes('Saldo insuficiente') ||
        msg.includes('Debe seleccionar') ||
        msg.includes('mayor a') ||
        msg.includes('inactiva')
      ) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async anularPagoLiquidacion(req: Request, res: Response): Promise<void> {
    try {
      const liquidacionId = parseInt(req.params.liquidacionId);
      if (isNaN(liquidacionId)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.anularPagoLiquidacion(liquidacionId, req.usuario!.id, req.usuario!.rol);
      R.ok(res, data, 'Pago de liquidación anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('PAGADA')) R.badRequest(res, msg);
      else if (msg.includes('Solo el')) R.forbidden(res, msg);
      else if (msg.includes('No se encontró') || msg.includes('Saldo insuficiente')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const cajaController = new CajaController();
