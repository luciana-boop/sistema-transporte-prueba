// FILE: src/modules/cobranza/cobranza.controller.ts

import { Request, Response } from 'express';
import { cobranzaService } from './cobranza.service';
import { generarPdfEstadoCuenta } from './estado-cuenta-pdf.generator';
import * as R from '../../utils/response';

export class CobranzaController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, desde, hasta, clienteId, search } = req.query as Record<string, string>;
      R.ok(res, await cobranzaService.listar({ estado: estado as 'por_aplicar' | 'aplicado' | undefined, desde, hasta, clienteId, search }));
    } catch (e) { R.serverError(res, e); }
  }

  async facturasPendientes(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.clienteId);
      if (isNaN(clienteId)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cobranzaService.facturasPendientes({ clienteId }));
    } catch (e) { R.serverError(res, e); }
  }

  /**
   * GET /api/cobranza/facturas-pendientes?clienteId=
   * Igual que facturasPendientes pero sin cliente obligatorio en la ruta —
   * alimenta la pestaña "Facturas por cobrar" (todas o filtradas por cliente).
   */
  async facturasPendientesTodas(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.query as Record<string, string>;
      R.ok(res, await cobranzaService.facturasPendientes({
        clienteId: clienteId ? parseInt(clienteId) : undefined,
      }));
    } catch (e) { R.serverError(res, e); }
  }

  async estadoCuenta(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.clienteId);
      if (isNaN(clienteId)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await cobranzaService.estadoCuenta(clienteId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async estadoCuentaPdf(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.clienteId);
      if (isNaN(clienteId)) { R.badRequest(res, 'ID inválido'); return; }
      const estadoCuenta = await cobranzaService.estadoCuenta(clienteId);
      const buffer = await generarPdfEstadoCuenta(estadoCuenta);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="estado_cuenta_${clienteId}.pdf"`);
      res.send(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async aplicar(req: Request, res: Response): Promise<void> {
    try {
      const pagoId = parseInt(req.params.pagoId);
      if (isNaN(pagoId)) { R.badRequest(res, 'ID inválido'); return; }
      const { aplicaciones } = req.body;
      if (!Array.isArray(aplicaciones) || aplicaciones.length === 0) {
        R.badRequest(res, 'aplicaciones debe ser un arreglo no vacío'); return;
      }
      const data = await cobranzaService.aplicar(pagoId, {
        aplicaciones: aplicaciones.map((a: any) => ({ facturaId: parseInt(a.facturaId), monto: parseFloat(a.monto) })),
      }, req.usuario!.id);
      R.created(res, data, 'Pago aplicado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrad') || msg.includes('anulad') || msg.includes('excede') ||
          msg.includes('Debe indicar') || msg.includes('pertenece') || msg.includes('mayor a')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async quitarAplicacion(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cobranzaService.quitarAplicacion(id, req.usuario!.rol);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Solo')) R.forbidden(res, msg);
      else if (msg.includes('no encontrada')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const cobranzaController = new CobranzaController();
