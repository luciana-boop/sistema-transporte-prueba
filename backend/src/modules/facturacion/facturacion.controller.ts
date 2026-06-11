// FILE: src/modules/facturacion/facturacion.controller.ts
// CAMBIOS v2:
//   P1 — servirPdf(): devuelve metadata del PDF (pdfPath) para que el frontend lo abra/descargue
//   P2 — anular(): maneja el nuevo error de pagos activos (400)

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { facturacionService } from './facturacion.service';
import * as R from '../../utils/response';

export class FacturacionController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, clienteId, desde, hasta, serie, page, limit } = req.query as Record<string, string>;
      R.ok(res, await facturacionService.findAll({ estado, clienteId, desde, hasta, serie, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await facturacionService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async series(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await facturacionService.getSeries());
    } catch (e) { R.serverError(res, e); }
  }

  async proximoCorrelativo(req: Request, res: Response): Promise<void> {
    try {
      const serie = (req.params.serie || 'F001').toUpperCase();
      const correlativo = await facturacionService.getNextCorrelativo(serie);
      R.ok(res, { serie, correlativo, numeroFactura: `${serie}-${String(correlativo).padStart(5, '0')}` });
    } catch (e) { R.serverError(res, e); }
  }

  // ── P1: servir/descargar PDF ─────────────────────────────────────────────────
  /**
   * GET /api/facturacion/:id/pdf
   * Devuelve el PDF de la factura.
   * - Si pdfPath apunta a un archivo existente en disco → lo sirve como application/pdf
   * - Si pdfPath es una URL externa → redirige
   * - Si no hay pdfPath → 404 con mensaje claro
   *
   * Query param: ?download=1  → fuerza Content-Disposition: attachment (descarga)
   */
  async servirPdf(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const pdfPath = await facturacionService.getPdfPath(id);

      if (!pdfPath) {
        res.status(404).json({
          success: false,
          error: 'Esta factura no tiene PDF generado. El PDF se genera al emitir la factura a través del sistema de facturación electrónica.',
        });
        return;
      }

      // URL externa (SUNAT OSE, etc.)
      if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) {
        res.redirect(302, pdfPath);
        return;
      }

      // Ruta local — resolver relativa a process.cwd() si no es absoluta
      const absolutePath = path.isAbsolute(pdfPath)
        ? pdfPath
        : path.join(process.cwd(), pdfPath);

      // Validar que la ruta resuelta esté dentro del directorio de almacenamiento
      // permitido, para prevenir ataques de path traversal.
      const storageBase = path.resolve(process.cwd(), 'storage');
      const resolvedPath = path.resolve(absolutePath);
      if (!resolvedPath.startsWith(storageBase + path.sep) && !resolvedPath.startsWith(storageBase)) {
        res.status(403).json({ success: false, error: 'Acceso denegado al archivo solicitado' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({
          success: false,
          error: 'El archivo PDF no fue encontrado en el servidor. Puede que haya sido movido o eliminado.',
        });
        return;
      }

      const forceDownload = req.query.download === '1';
      const filename = path.basename(resolvedPath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        forceDownload
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const stream = fs.createReadStream(resolvedPath);
      stream.on('error', (err) => {
        console.error('[PDF stream error]', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error leyendo el archivo PDF' });
        }
      });
      stream.pipe(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  /**
   * GET /api/facturacion/:id/pdf-info
   * Devuelve solo la metadata del PDF (existe, ruta, etc.) sin hacer streaming.
   * Útil para que el frontend decida qué botones mostrar.
   */
  async infoPdf(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }

      const pdfPath = await facturacionService.getPdfPath(id);

      if (!pdfPath) {
        R.ok(res, { tienePdf: false, pdfPath: null, archivoExiste: false });
        return;
      }

      let archivoExiste = false;
      const esUrl = pdfPath.startsWith('http://') || pdfPath.startsWith('https://');

      if (!esUrl) {
        const absolutePath = path.isAbsolute(pdfPath)
          ? pdfPath
          : path.join(process.cwd(), pdfPath);
        const resolvedInfoPath = path.resolve(absolutePath);
        const storageBaseInfo = path.resolve(process.cwd(), 'storage');
        if (resolvedInfoPath.startsWith(storageBaseInfo + path.sep) || resolvedInfoPath.startsWith(storageBaseInfo)) {
          archivoExiste = fs.existsSync(resolvedInfoPath);
        }
      }

      R.ok(res, {
        tienePdf: true,
        pdfPath,
        esUrl,
        archivoExiste: esUrl ? true : archivoExiste,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
  // ── fin P1 ───────────────────────────────────────────────────────────────────

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, subtotal } = req.body;

      if (!clienteId || !subtotal) {
        R.badRequest(res, 'clienteId y subtotal son requeridos'); return;
      }

      const data = await facturacionService.create(
        {
          ...req.body,
          clienteId: parseInt(clienteId),
          pedidoId: req.body.pedidoId ? parseInt(req.body.pedidoId) : undefined,
          correlativo: req.body.correlativo ? parseInt(req.body.correlativo) : undefined,
          subtotal: parseFloat(subtotal),
          porcentajeIgv: req.body.porcentajeIgv ? parseFloat(req.body.porcentajeIgv) : undefined,
          diasCredito: req.body.diasCredito ? parseInt(req.body.diasCredito) : undefined,
          porcentajeDetraccion: req.body.porcentajeDetraccion ? parseFloat(req.body.porcentajeDetraccion) : undefined,
          fechaEmision: req.body.fechaEmision || undefined,
          lineas: Array.isArray(req.body.lineas) ? req.body.lineas : undefined,
        },
        req.usuario!.id
      );
      R.created(res, data, 'Factura emitida');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('ya existe')) R.badRequest(res, msg);
      else if (msg.includes('ya está facturado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async crearDesdeXml(req: Request, res: Response): Promise<void> {
    try {
      const xmlData = req.body;
      if (!xmlData.ruc || !xmlData.serie || !xmlData.correlativo) {
        R.badRequest(res, 'Datos XML incompletos: ruc, serie, correlativo requeridos'); return;
      }
      const factura = await facturacionService.createFromXml(xmlData, req.usuario!.id);
      R.created(res, factura, 'Factura creada desde XML');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.startsWith('DUPLICADO')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async importacionMasivaXml(req: Request, res: Response): Promise<void> {
    try {
      const xmlList: any[] = req.body.facturas;
      if (!Array.isArray(xmlList) || xmlList.length === 0) {
        R.badRequest(res, 'Se requiere un array de facturas'); return;
      }

      const resultados = { creadas: 0, duplicadas: 0, errores: [] as string[] };

      for (const xmlData of xmlList) {
        try {
          await facturacionService.createFromXml(xmlData, req.usuario!.id);
          resultados.creadas++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith('DUPLICADO')) {
            resultados.duplicadas++;
          } else {
            resultados.errores.push(msg);
          }
        }
      }

      R.ok(res, resultados, `Importación completada: ${resultados.creadas} creadas, ${resultados.duplicadas} duplicadas, ${resultados.errores.length} errores`);
    } catch (e) { R.serverError(res, e); }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await facturacionService.update(id, {
        ...req.body,
        clienteId: req.body.clienteId !== undefined ? parseInt(req.body.clienteId) : undefined,
        subtotal: req.body.subtotal !== undefined ? parseFloat(req.body.subtotal) : undefined,
        porcentajeIgv: req.body.porcentajeIgv !== undefined ? parseFloat(req.body.porcentajeIgv) : undefined,
        diasCredito: req.body.diasCredito !== undefined ? parseInt(req.body.diasCredito) : undefined,
        porcentajeDetraccion: req.body.porcentajeDetraccion !== undefined ? parseFloat(req.body.porcentajeDetraccion) : undefined,
        peso: req.body.peso !== undefined ? parseFloat(req.body.peso) : undefined,
        lineas: Array.isArray(req.body.lineas) ? req.body.lineas : undefined,
      });
      R.ok(res, data, 'Factura actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else if (msg.includes('anulada') || msg.includes('no encontrado') || msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anular(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await facturacionService.anular(id, req.usuario!.rol), 'Factura anulada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else if (msg.includes('Solo el')) R.forbidden(res, msg);
      // P2: pagos activos → 400
      else if (msg.includes('pagos registrados') || msg.includes('ya está') || msg.includes('No se puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await facturacionService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Factura eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else if (msg.includes('Solo')) R.forbidden(res, msg);
      else if (msg.includes('anuladas')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const facturacionController = new FacturacionController();
