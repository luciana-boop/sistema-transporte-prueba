// FILE: src/modules/reportes/reportes.controller.ts

import { Request, Response } from 'express';
import { reportesService } from './reportes.service';
import * as R from '../../utils/response';

export class ReportesController {
  async dashboard(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      const data = await reportesService.dashboardGeneral({ desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async anual(req: Request, res: Response): Promise<void> {
    try {
      const { anio } = req.query as Record<string, string>;
      const anioParseado = anio ? parseInt(anio) : new Date().getFullYear();
      if (isNaN(anioParseado)) { R.badRequest(res, 'anio inválido'); return; }
      const data = await reportesService.reporteAnual(anioParseado);
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
      const { desde, hasta, clienteId } = req.query as Record<string, string>;
      const data = await reportesService.reporteCobranza({ desde, hasta, clienteId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async caja(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      const data = await reportesService.reporteCaja({ desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async gastos(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      const data = await reportesService.reporteGastos({ desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }
}

export const reportesController = new ReportesController();
