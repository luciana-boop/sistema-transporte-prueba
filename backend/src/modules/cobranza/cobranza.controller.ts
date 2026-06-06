// FILE: src/modules/cobranza/cobranza.controller.ts
// CHAT 9: cuentaId y monedaId son obligatorios al registrar pago.

import { Request, Response } from 'express';
import { cobranzaService } from './cobranza.service';
import * as R from '../../utils/response';

export class CobranzaController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, metodoPago, desde, hasta, facturaId } = req.query as Record<string, string>;
      R.ok(res, await cobranzaService.findAll({ clienteId, metodoPago, desde, hasta, facturaId }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cobranzaService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pago no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async facturasPorCliente(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.clienteId);
      if (isNaN(clienteId)) { R.badRequest(res, 'clienteId inválido'); return; }
      R.ok(res, await cobranzaService.facturasPendientesPorCliente(clienteId));
    } catch (e) { R.serverError(res, e); }
  }

  async registrarPago(req: Request, res: Response): Promise<void> {
    try {
      const { facturaId, monto, metodoPago, referencia, observaciones, fechaPago, cuentaId, monedaId, tipoPagoId } = req.body;

      if (!facturaId || !monto || !metodoPago) {
        R.badRequest(res, 'facturaId, monto y metodoPago son requeridos'); return;
      }
      // CHAT 9: cuentaId obligatorio; monedaId es resuelto en el service desde la cuenta si no viene
      if (!cuentaId) { R.badRequest(res, 'Debe seleccionar una cuenta para registrar el cobro'); return; }

      R.created(res,
        await cobranzaService.create(
          {
            facturaId: parseInt(facturaId),
            monto: parseFloat(monto),
            metodoPago,
            referencia,
            observaciones,
            fechaPago,
            cuentaId: parseInt(cuentaId),
            monedaId: monedaId ? parseInt(monedaId) : 0,
            tipoPagoId: tipoPagoId ? parseInt(tipoPagoId) : undefined,
          },
          req.usuario!.id
        ),
        'Pago registrado'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrada') ||
        msg.includes('excede') ||
        msg.includes('anulada') ||
        msg.includes('pagada') ||
        msg.includes('Debe seleccionar') ||
        msg.includes('Saldo insuficiente') ||
        msg.includes('inactiva')
      ) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { metodoPago, referencia, observaciones, fechaPago } = req.body;
      R.ok(res,
        await cobranzaService.update(id, { metodoPago, referencia, observaciones, fechaPago }, req.usuario!.rol),
        'Pago actualizado'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pago no encontrado') R.notFound(res, msg);
      else if (msg.includes('anulado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anular(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { motivo } = req.body;
      R.ok(res, await cobranzaService.anular(id, req.usuario!.rol, motivo), 'Pago anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pago no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo el')) R.forbidden(res, msg);
      else if (msg.includes('ya está') || msg.includes('Saldo insuficiente')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cobranzaService.remove(id, req.usuario!.rol));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pago no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo')) R.forbidden(res, msg);
      else R.serverError(res, e);
    }
  }

  async cuentasPorCobrar(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await cobranzaService.cuentasPorCobrar());
    } catch (e) { R.serverError(res, e); }
  }
}

export const cobranzaController = new CobranzaController();
