// FILE: src/modules/configuracion/cuentas.controller.ts

import { Request, Response } from 'express';
import { cuentasService } from './cuentas.service';
import * as R from '../../utils/response';

export class CuentasController {

  async inicializar(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.inicializarDefaults()); }
    catch (e) { R.serverError(res, e); }
  }

  // ── MONEDAS ─────────────────────────────────────────────────────────────────
  async getMonedas(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getMonedas()); }
    catch (e) { R.serverError(res, e); }
  }

  async getMonedasActivas(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getMonedasActivas()); }
    catch (e) { R.serverError(res, e); }
  }

  async getMonedaDefault(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getMonedaDefault()); }
    catch (e) { R.serverError(res, e); }
  }

  async createMoneda(req: Request, res: Response): Promise<void> {
    try {
      const { codigo, nombre, simbolo, esPorDefecto } = req.body;
      if (!codigo || !nombre || !simbolo) {
        R.badRequest(res, 'codigo, nombre y simbolo son requeridos'); return;
      }
      R.created(res, await cuentasService.createMoneda({ codigo, nombre, simbolo, esPorDefecto }, req.usuario!.id), 'Moneda creada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateMoneda(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cuentasService.updateMoneda(id, req.body, req.usuario!.id), 'Moneda actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Moneda no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteMoneda(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cuentasService.deleteMoneda(id);
      R.ok(res, null, 'Moneda eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Moneda no encontrada') R.notFound(res, msg);
      else if (msg.includes('defecto') || msg.includes('en uso')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── TIPOS DE PAGO ───────────────────────────────────────────────────────────
  async getTiposPago(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getTiposPago()); }
    catch (e) { R.serverError(res, e); }
  }

  async getTiposPagoActivos(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getTiposPagoActivos()); }
    catch (e) { R.serverError(res, e); }
  }

  async createTipoPago(req: Request, res: Response): Promise<void> {
    try {
      const { codigo, nombre, descripcion, orden } = req.body;
      if (!codigo || !nombre) { R.badRequest(res, 'codigo y nombre son requeridos'); return; }
      R.created(res, await cuentasService.createTipoPago({ codigo, nombre, descripcion, orden: orden ? parseInt(orden) : undefined }, req.usuario!.id), 'Tipo de pago creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateTipoPago(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const dto = { ...req.body };
      if (dto.orden) dto.orden = parseInt(dto.orden);
      R.ok(res, await cuentasService.updateTipoPago(id, dto, req.usuario!.id), 'Tipo de pago actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Tipo de pago no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteTipoPago(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cuentasService.deleteTipoPago(id);
      R.ok(res, null, 'Tipo de pago eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Tipo de pago no encontrado') R.notFound(res, msg);
      else if (msg.includes('en uso')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── CUENTAS ─────────────────────────────────────────────────────────────────
  async getCuentas(req: Request, res: Response): Promise<void> {
    try {
      const soloActivas = req.query.activo === 'true';
      R.ok(res, await cuentasService.getCuentas(soloActivas));
    } catch (e) { R.serverError(res, e); }
  }

  async getCuenta(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cuentasService.getCuenta(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cuenta no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async createCuenta(req: Request, res: Response): Promise<void> {
    try {
      const { nombre, tipoCuenta, monedaId, saldoInicial, descripcion, banco, numeroCuenta } = req.body;
      if (!nombre || !tipoCuenta || !monedaId) {
        R.badRequest(res, 'nombre, tipoCuenta y monedaId son requeridos'); return;
      }
      R.created(res, await cuentasService.createCuenta({
        nombre, tipoCuenta, monedaId: parseInt(monedaId),
        saldoInicial: saldoInicial ? parseFloat(saldoInicial) : 0,
        descripcion, banco, numeroCuenta,
      }, req.usuario!.id), 'Cuenta creada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateCuenta(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const dto = { ...req.body };
      if (dto.monedaId) dto.monedaId = parseInt(dto.monedaId);
      R.ok(res, await cuentasService.updateCuenta(id, dto, req.usuario!.id), 'Cuenta actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cuenta no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteCuenta(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cuentasService.deleteCuenta(id);
      R.ok(res, null, 'Cuenta eliminada/desactivada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cuenta no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── MOVIMIENTOS ─────────────────────────────────────────────────────────────
  async getMovimientos(req: Request, res: Response): Promise<void> {
    try {
      const { cuentaId, tipo, desde, hasta, page, limit } = req.query as Record<string, string>;
      R.ok(res, await cuentasService.getMovimientos({
        cuentaId: cuentaId ? parseInt(cuentaId) : undefined,
        tipo, desde, hasta, page, limit,
      }));
    } catch (e) { R.serverError(res, e); }
  }

  async registrarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const { cuentaId, tipo, monto, monedaId, tipoPagoId, concepto, referencia, fecha } = req.body;
      if (!cuentaId || !tipo || !monto || !monedaId || !concepto) {
        R.badRequest(res, 'cuentaId, tipo, monto, monedaId y concepto son requeridos'); return;
      }
      if (!['INGRESO', 'EGRESO'].includes(tipo)) {
        R.badRequest(res, 'tipo debe ser INGRESO o EGRESO'); return;
      }
      R.created(res, await cuentasService.registrarMovimiento({
        cuentaId: parseInt(cuentaId),
        tipo,
        monto: parseFloat(monto),
        monedaId: parseInt(monedaId),
        tipoPagoId: tipoPagoId ? parseInt(tipoPagoId) : undefined,
        concepto,
        referencia,
        usuarioId: req.usuario!.id,
        fecha,
      }), 'Movimiento registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('inactiva') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── P7: ver detalle ──────────────────────────────────────────────────────────
  async obtenerMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cuentasService.obtenerMovimiento(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── P7: edición controlada ───────────────────────────────────────────────────
  async actualizarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { concepto, referencia, fecha, tipoPagoId } = req.body;
      R.ok(res, await cuentasService.actualizarMovimiento(id, {
        concepto,
        referencia,
        fecha,
        tipoPagoId: tipoPagoId !== undefined ? (tipoPagoId ? parseInt(tipoPagoId) : null) : undefined,
      }, req.usuario!.id), 'Movimiento actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else if (msg.includes('anulado') || msg.includes('reverso')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── P7: anular — revierte saldo y mantiene trazabilidad ──────────────────────
  async anularMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cuentasService.anularMovimiento(id, req.usuario!.id), 'Movimiento anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está anulado') || msg.includes('reverso') || msg.includes('saldo insuficiente')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async getResumenFinanciero(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await cuentasService.getResumenFinanciero()); }
    catch (e) { R.serverError(res, e); }
  }
}

export const cuentasController = new CuentasController();
