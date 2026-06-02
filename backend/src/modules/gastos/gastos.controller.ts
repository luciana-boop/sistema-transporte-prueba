// FILE: src/modules/gastos/gastos.controller.ts

import { Request, Response } from 'express';
import { gastosService } from './gastos.service';
import { TipoGasto } from '../../utils/enums';
import * as R from '../../utils/response';

export class GastosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { tipoGasto, pedidoId, usuarioId, desde, hasta } = req.query as Record<string, string>;
      const data = await gastosService.findAll({ tipoGasto, pedidoId, usuarioId, desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await gastosService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Gasto no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { pedidoId, tipoGasto, monto, descripcion, comprobante, fecha } = req.body;
      if (!tipoGasto || !monto || !descripcion) {
        R.badRequest(res, 'tipoGasto, monto y descripcion son requeridos'); return;
      }
      if (!Object.values(TipoGasto).includes(tipoGasto)) {
        R.badRequest(res, `tipoGasto inválido. Valores: ${Object.values(TipoGasto).join(', ')}`); return;
      }
      const data = await gastosService.create(
        { pedidoId: pedidoId ? parseInt(pedidoId) : undefined, tipoGasto, monto: parseFloat(monto), descripcion, comprobante, fecha },
        req.usuario!.id
      );
      R.created(res, data, 'Gasto registrado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await gastosService.update(id, req.body);
      R.ok(res, data, 'Gasto actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Gasto no encontrado') R.notFound(res, msg);
      else if (msg.includes('no encontrado') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await gastosService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Gasto eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Gasto no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo')) R.forbidden(res, msg);
      else R.serverError(res, e);
    }
  }

  async resumen(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, pedidoId } = req.query as Record<string, string>;
      const data = await gastosService.resumenPorTipo({ desde, hasta, pedidoId });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }
}

export const gastosController = new GastosController();
