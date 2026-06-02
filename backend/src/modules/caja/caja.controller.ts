// FILE: src/modules/caja/caja.controller.ts

import { Request, Response } from 'express';
import { cajaService } from './caja.service';
import { TipoMovimientoCaja } from '../../utils/enums';
import * as R from '../../utils/response';

export class CajaController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, usuarioId, desde, hasta } = req.query as Record<string, string>;
      const data = await cajaService.findAll({ estado, usuarioId, desde, hasta });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async cajaActual(req: Request, res: Response): Promise<void> {
    try {
      const data = await cajaService.cajaActual(req.usuario!.id);
      R.ok(res, data ?? null);
    } catch (e) { R.serverError(res, e); }
  }

  async abrir(req: Request, res: Response): Promise<void> {
    try {
      const { saldoApertura, observaciones } = req.body;
      if (saldoApertura === undefined) { R.badRequest(res, 'saldoApertura es requerido'); return; }
      const data = await cajaService.abrir(
        { saldoApertura: parseFloat(saldoApertura), observaciones },
        req.usuario!.id
      );
      R.created(res, data, 'Caja abierta correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async cerrar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { saldoCierre, observaciones } = req.body;
      if (saldoCierre === undefined) { R.badRequest(res, 'saldoCierre es requerido'); return; }
      const data = await cajaService.cerrar(
        id,
        { saldoCierre: parseFloat(saldoCierre), observaciones },
        req.usuario!.id
      );
      R.ok(res, data, 'Caja cerrada correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('ya está') || msg.includes('No puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async registrarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { tipo, monto, concepto } = req.body;
      if (!tipo || !monto || !concepto) { R.badRequest(res, 'tipo, monto y concepto son requeridos'); return; }
      if (!Object.values(TipoMovimientoCaja).includes(tipo)) {
        R.badRequest(res, `tipo inválido. Valores: ${Object.values(TipoMovimientoCaja).join(', ')}`); return;
      }
      const data = await cajaService.registrarMovimiento(id, { tipo, monto: parseFloat(monto), concepto }, req.usuario!.id);
      R.created(res, data, 'Movimiento registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('cerrada') || msg.includes('No puede') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cajaService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Caja eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('Solo') || msg.includes('abierta')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const cajaController = new CajaController();
