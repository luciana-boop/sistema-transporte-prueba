// FILE: src/modules/movimientos/movimientos.controller.ts

import { Request, Response } from 'express';
import { movimientosService } from './movimientos.service';
import * as R from '../../utils/response';

export class MovimientosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { tipo, cuentaId, desde, hasta, search, page, limit } = req.query as Record<string, string>;
      R.ok(res, await movimientosService.listar({ tipo, cuentaId, desde, hasta, search, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await movimientosService.obtener(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { cuentaId, tipo, monto, monedaId, tipoPagoId, concepto, referencia, fecha, notaEgreso, categoriaEgreso } = req.body;
      if (!cuentaId || !tipo || !monto || !monedaId || !concepto) {
        R.badRequest(res, 'cuentaId, tipo, monto, monedaId y concepto son requeridos'); return;
      }
      if (!['INGRESO', 'EGRESO'].includes(tipo)) {
        R.badRequest(res, 'tipo debe ser INGRESO o EGRESO'); return;
      }
      if (tipo === 'EGRESO' && !categoriaEgreso) {
        R.badRequest(res, 'Debe seleccionar una categoría para el egreso'); return;
      }
      const data = await movimientosService.crear({
        cuentaId: parseInt(cuentaId),
        tipo,
        monto: parseFloat(monto),
        monedaId: parseInt(monedaId),
        tipoPagoId: tipoPagoId ? parseInt(tipoPagoId) : undefined,
        concepto,
        referencia,
        fecha,
        notaEgreso: tipo === 'EGRESO' ? notaEgreso : undefined,
        categoriaEgreso: tipo === 'EGRESO' ? categoriaEgreso : undefined,
      }, req.usuario!.id);
      R.created(res, data, 'Movimiento registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('inactiva') || msg.includes('mayor a') || msg.includes('Saldo insuficiente')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { concepto, referencia, fecha, tipoPagoId, notaEgreso, categoriaEgreso } = req.body;
      R.ok(res, await movimientosService.actualizar(id, { concepto, referencia, fecha, tipoPagoId, notaEgreso, categoriaEgreso }), 'Movimiento actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else if (msg.includes('anulado') || msg.includes('reverso') || msg.includes('solo aplica') || msg.includes('No se puede cambiar')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anular(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await movimientosService.anular(id, req.usuario!.id), 'Movimiento anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Movimiento no encontrado') R.notFound(res, msg);
      else if (msg.includes('anulado') || msg.includes('reverso') || msg.includes('saldo')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async resumen(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, cuentaId } = req.query as Record<string, string>;
      R.ok(res, await movimientosService.resumen({ desde, hasta, cuentaId }));
    } catch (e) { R.serverError(res, e); }
  }

  async importar(req: Request, res: Response): Promise<void> {
    try {
      const { cuentaId, monedaId, filas, confirmarDuplicados } = req.body;
      if (!cuentaId || !monedaId || !Array.isArray(filas) || filas.length === 0) {
        R.badRequest(res, 'cuentaId, monedaId y filas (no vacío) son requeridos'); return;
      }
      const data = await movimientosService.importarLote({
        cuentaId: parseInt(cuentaId),
        monedaId: parseInt(monedaId),
        filas,
        confirmarDuplicados: confirmarDuplicados === true,
      }, req.usuario!.id);
      R.created(res, data, `Importación completada: ${data.creados} movimiento(s) creado(s)`);
    } catch (e) { R.serverError(res, e); }
  }

  async facturasPorCliente(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.clienteId);
      if (isNaN(clienteId)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await movimientosService.facturasPorCliente(clienteId));
    } catch (e) { R.serverError(res, e); }
  }

  async vincularCobranza(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { clienteId, facturaId, observacion } = req.body;
      if (!clienteId) { R.badRequest(res, 'clienteId es requerido'); return; }
      const data = await movimientosService.vincularCobranza(id, {
        clienteId: parseInt(clienteId),
        facturaId: facturaId ? parseInt(facturaId) : undefined,
        observacion,
      }, req.usuario!.id);
      R.created(res, data, 'Cobranza vinculada correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrad') || msg.includes('no se puede') || msg.includes('No se puede') ||
          msg.includes('Debe indicar') || msg.includes('ya tiene') || msg.includes('excede') ||
          msg.includes('pertenece') || msg.includes('anulada') || msg.includes('pagada')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async desvincularCobranza(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await movimientosService.desvincularCobranza(id, req.usuario!.rol);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Solo') ) R.forbidden(res, msg);
      else if (msg.includes('no tiene')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const movimientosController = new MovimientosController();
