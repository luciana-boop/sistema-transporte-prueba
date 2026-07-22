// FILE: src/modules/reportes/reportes.controller.ts

import { Request, Response } from 'express';
import { reportesService } from './reportes.service';
import * as R from '../../utils/response';

export class ReportesController {
  async dashboard(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, monedaId } = req.query as Record<string, string>;
      const data = await reportesService.dashboardGeneral({ desde, hasta, monedaId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async anual(req: Request, res: Response): Promise<void> {
    try {
      const { anio, monedaId } = req.query as Record<string, string>;
      const anioParseado = anio ? parseInt(anio) : new Date().getFullYear();
      if (isNaN(anioParseado)) { R.badRequest(res, 'anio inválido'); return; }
      const data = await reportesService.reporteAnual(anioParseado, monedaId);
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async conductorDelMes(req: Request, res: Response): Promise<void> {
    try {
      const data = await reportesService.conductorDelMes();
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async tablaSemanal(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      const data = await reportesService.tablaSemanal({ desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async pedidos(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, clienteId } = req.query as Record<string, string>;
      const data = await reportesService.reportePedidos({ desde, hasta, clienteId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async facturacion(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, clienteId } = req.query as Record<string, string>;
      const data = await reportesService.reporteFacturacion({ desde, hasta, clienteId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async cobranza(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, clienteId, monedaId } = req.query as Record<string, string>;
      const data = await reportesService.reporteCobranza({ desde, hasta, clienteId, monedaId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async caja(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, monedaId } = req.query as Record<string, string>;
      const data = await reportesService.reporteCaja({ desde, hasta, monedaId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async egresos(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, monedaId } = req.query as Record<string, string>;
      const data = await reportesService.reporteEgresos({ desde, hasta, monedaId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async mantenimiento(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, vehiculoId, monedaId } = req.query as Record<string, string>;
      const data = await reportesService.reporteMantenimiento({ desde, hasta, vehiculoId, monedaId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async rentabilidadPorCliente(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, clienteId } = req.query as Record<string, string>;
      const data = await reportesService.rentabilidadPorCliente({ desde, hasta, clienteId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async rentabilidadClienteDetalle(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId } = req.params;
      const { desde, hasta } = req.query as Record<string, string>;
      const id = parseInt(clienteId);
      if (isNaN(id)) { R.badRequest(res, 'clienteId inválido'); return; }
      const data = await reportesService.rentabilidadClienteDetalle(id, { desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async detalleConductorSemanal(req: Request, res: Response): Promise<void> {
    try {
      const { conductorId } = req.params;
      const { desde, hasta } = req.query as Record<string, string>;
      const id = parseInt(conductorId);
      if (isNaN(id)) { R.badRequest(res, 'conductorId inválido'); return; }
      const data = await reportesService.detalleConductorSemanal(id, { desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }
}

export const reportesController = new ReportesController();
