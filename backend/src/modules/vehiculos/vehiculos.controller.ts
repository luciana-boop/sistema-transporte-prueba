// FILE: src/modules/vehiculos/vehiculos.controller.ts

import { Request, Response } from 'express';
import { vehiculosService } from './vehiculos.service';
import * as R from '../../utils/response';

export class VehiculosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { tipo, activo, search, page, limit } = req.query as Record<string, string>;
      R.ok(res, await vehiculosService.findAll({ tipo, activo, search, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await vehiculosService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Vehículo no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { placa, tipo, marca, modelo, anio } = req.body;
      if (!placa || !tipo || !marca || !modelo || !anio) {
        R.badRequest(res, 'placa, tipo, marca, modelo y anio son requeridos'); return;
      }
      R.created(res, await vehiculosService.create({ ...req.body, anio: parseInt(anio) }, req.usuario!.id), 'Vehículo creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya está registrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const dto = req.body.anio ? { ...req.body, anio: parseInt(req.body.anio) } : req.body;
      R.ok(res, await vehiculosService.update(id, dto, req.usuario!.id), 'Vehículo actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Vehículo no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está registrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await vehiculosService.remove(id);
      R.ok(res, null, 'Vehículo eliminado/desactivado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Vehículo no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const vehiculosController = new VehiculosController();
