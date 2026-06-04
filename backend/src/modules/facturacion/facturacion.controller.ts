// FILE: src/modules/facturacion/facturacion.controller.ts
// CAMBIOS:
//   - Acepta 'fechaEmision' en el body (antes no se procesaba explícitamente)
//   - Acepta 'lineas' en el body para detalle de factura
//   - Validación ajustada: fechaVencimiento ya no es obligatorio (se calcula en service)

import { Request, Response } from 'express';
import { facturacionService } from './facturacion.service';
import * as R from '../../utils/response';

export class FacturacionController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, clienteId, desde, hasta, serie } = req.query as Record<string, string>;
      R.ok(res, await facturacionService.findAll({ estado, clienteId, desde, hasta, serie }));
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

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, subtotal } = req.body;

      // CAMBIO: fechaVencimiento ya no es requerida (se calcula automáticamente en el service)
      if (!clienteId || !subtotal) {
        R.badRequest(res, 'clienteId y subtotal son requeridos'); return;
      }

      const data = await facturacionService.create(
        {
          ...req.body,
          clienteId: parseInt(clienteId),
          pedidoId: req.body.pedidoId ? parseInt(req.body.pedidoId) : undefined,
          subtotal: parseFloat(subtotal),
          porcentajeIgv: req.body.porcentajeIgv ? parseFloat(req.body.porcentajeIgv) : undefined,
          diasCredito: req.body.diasCredito ? parseInt(req.body.diasCredito) : undefined,
          porcentajeDetraccion: req.body.porcentajeDetraccion ? parseFloat(req.body.porcentajeDetraccion) : undefined,
          // NUEVO: pasar fechaEmision si viene en el body
          fechaEmision: req.body.fechaEmision || undefined,
          // NUEVO: pasar líneas de detalle si vienen
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
      R.ok(res, await facturacionService.update(id, req.body), 'Factura actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Factura no encontrada') R.notFound(res, msg);
      else if (msg.includes('anulada')) R.badRequest(res, msg);
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
      else if (msg.includes('ya está') || msg.includes('No se puede')) R.badRequest(res, msg);
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
