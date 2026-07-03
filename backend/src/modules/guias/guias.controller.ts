// FILE: src/modules/guias/guias.controller.ts
// Portado de MONKSAAS (sin crearDesdeVenta: este sistema no tiene módulo Ventas).

import { Request, Response } from 'express';
import { guiasService } from './guias.service';
import * as R from '../../utils/response';

const parseId = (req: Request, res: Response): number | null => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return null; }
  return id;
};

const handle = (res: Response, e: unknown) => {
  const msg = e instanceof Error ? e.message : '';
  if (msg.toLowerCase().includes('no encontrad')) return R.notFound(res, msg);
  if (
    msg.includes('al menos') || msg.includes('anulad') ||
    msg.includes('ya fue') || msg.includes('Ya existe') ||
    msg.includes('obligatorio') || msg.includes('Indique un cliente')
  ) return R.badRequest(res, msg);
  R.serverError(res, e);
};

export const guiasController = {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, pedidoId, estado, page, limit, search, desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await guiasService.listar({ clienteId, pedidoId, estado, page, limit, search, desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  },

  async generarPdf(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req, res); if (id === null) return;
      const doc = await guiasService.obtener(id);
      const fs = require('fs');
      const path = require('path');
      const { generarPdfGuia } = await import('../pdf/guia-pdf.generator');
      const rutaRel = await generarPdfGuia(doc);
      const rutaAbs = path.join(process.cwd(), rutaRel);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${(doc as any).numero}.pdf"`);
      fs.createReadStream(rutaAbs).pipe(res);
    } catch (e) { handle(res, e); }
  },

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req, res); if (id === null) return;
      R.ok(res, await guiasService.obtener(id));
    } catch (e) { handle(res, e); }
  },

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, clienteNombre, clienteNumDoc, detalles } = req.body;
      if ((!clienteId && !(clienteNombre && clienteNumDoc)) || !Array.isArray(detalles) || detalles.length === 0) {
        R.badRequest(res, 'Indique clienteId o (clienteNombre + clienteNumDoc), y detalles (array)'); return;
      }
      R.created(res, await guiasService.crear(req.body, req.usuario!.id), 'Guía creada');
    } catch (e) { handle(res, e); }
  },

  async anular(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req, res); if (id === null) return;
      R.ok(res, await guiasService.anular(id), 'Guía anulada');
    } catch (e) { handle(res, e); }
  },

  async vincularFactura(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req, res); if (id === null) return;
      const { facturaId } = req.body;
      if (!facturaId) { R.badRequest(res, 'facturaId es requerido'); return; }
      R.ok(res, await guiasService.vincularFactura(id, Number(facturaId)), 'Guía vinculada a factura');
    } catch (e) { handle(res, e); }
  },

  // ── Envío manual a SUNAT ─────────────────────────────────────────────────────
  async pendientesSunat(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await guiasService.pendientesSunat());
    } catch (e) { R.serverError(res, e); }
  },

  async enviarSunat(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req, res); if (id === null) return;
      await guiasService.reenviarSunat(id);
      R.ok(res, await guiasService.obtener(id), 'Guía enviada a SUNAT');
    } catch (e) { handle(res, e); }
  },

  async enviarSunatLote(req: Request, res: Response): Promise<void> {
    try {
      const ids: number[] = Array.isArray(req.body.ids) ? req.body.ids.map((id: any) => parseInt(id)) : [];
      if (ids.length === 0) { R.badRequest(res, 'Se requiere un array de ids'); return; }
      const resultado = await guiasService.enviarLoteSunat(ids);
      R.ok(res, resultado, `${resultado.enviados} guía(s) enviada(s) a SUNAT`);
    } catch (e) { R.serverError(res, e); }
  },
};
