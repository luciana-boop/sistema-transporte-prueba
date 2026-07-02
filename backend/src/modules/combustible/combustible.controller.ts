// FILE: src/modules/combustible/combustible.controller.ts
// Las cargas de combustible se vinculan a un egreso existente (Movimientos,
// categoría COMBUSTIBLE) en vez de generar su propio movimiento financiero.

import { Request, Response } from 'express';
import { combustibleService } from './combustible.service';
import * as R from '../../utils/response';

export class CombustibleController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { vehiculoId, conductorId, desde, hasta, page, limit } = req.query as Record<string, string>;
      R.ok(res, await combustibleService.findAll({ vehiculoId, conductorId, desde, hasta, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async resumen(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await combustibleService.resumen({ desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async egresosDisponibles(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await combustibleService.egresosDisponibles());
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await combustibleService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { vehiculoId, fecha, galones, monto, conductorId, liquidacionId, kilometraje, grifo, observaciones, movimientoCuentaId } = req.body;

      if (!vehiculoId || !fecha || galones === undefined || monto === undefined) {
        R.badRequest(res, 'vehiculoId, fecha, galones y monto son requeridos'); return;
      }
      if (!movimientoCuentaId) { R.badRequest(res, 'Debe seleccionar un egreso de combustible'); return; }

      R.created(res, await combustibleService.create({
        vehiculoId: parseInt(vehiculoId),
        conductorId: conductorId ? parseInt(conductorId) : undefined,
        // P4: asociación opcional a la liquidación del conductor
        liquidacionId: liquidacionId ? parseInt(liquidacionId) : undefined,
        fecha,
        galones: parseFloat(galones),
        monto: parseFloat(monto),
        kilometraje: kilometraje ? parseFloat(kilometraje) : undefined,
        grifo,
        observaciones,
        movimientoCuentaId: parseInt(movimientoCuentaId),
      }, req.usuario!.id), 'Carga registrada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('no encontrado') ||
        msg.includes('no encontrada') ||
        msg.includes('excede el saldo') ||
        msg.includes('Debe seleccionar') ||
        msg.includes('mayor a') ||
        msg.includes('anulado') ||
        msg.includes('no es un egreso')
      ) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { vehiculoId, conductorId, liquidacionId, fecha, galones, monto, kilometraje, grifo, observaciones } = req.body;
      R.ok(res, await combustibleService.update(id, {
        vehiculoId,
        conductorId,
        // P4: permite asociar/desasociar la liquidación (null = quitar asociación)
        liquidacionId: liquidacionId === null ? null : (liquidacionId !== undefined ? parseInt(liquidacionId) : undefined),
        fecha,
        galones,
        monto: monto !== undefined ? parseFloat(monto) : undefined,
        kilometraje,
        grifo,
        observaciones,
      }), 'Registro actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else if (msg.includes('no encontrada') || msg.includes('no pertenece') || msg.includes('excede el saldo') || msg.includes('mayor a')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await combustibleService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Registro eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo')) R.forbidden(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const combustibleController = new CombustibleController();
