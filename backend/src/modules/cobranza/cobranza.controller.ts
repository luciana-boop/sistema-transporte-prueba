// FILE: src/modules/cobranza/cobranza.controller.ts

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
      const { facturaId, monto, metodoPago, referencia, observaciones, fechaPago } = req.body;
      if (!facturaId || !monto || !metodoPago) {
        R.badRequest(res, 'facturaId, monto y metodoPago son requeridos'); return;
      }
      R.created(res,
        await cobranzaService.create(
          { facturaId: parseInt(facturaId), monto: parseFloat(monto), metodoPago, referencia, observaciones, fechaPago },
          req.usuario!.id
        ),
        'Pago registrado'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada') || msg.includes('excede') || msg.includes('anulada') || msg.includes('pagada')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
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
