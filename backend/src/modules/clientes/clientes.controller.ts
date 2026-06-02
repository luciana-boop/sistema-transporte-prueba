// FILE: src/modules/clientes/clientes.controller.ts

import { Request, Response } from 'express';
import { clientesService } from './clientes.service';
import * as R from '../../utils/response';

export class ClientesController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { activo, search } = req.query as Record<string, string>;
      const data = await clientesService.findAll({ activo, search });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await clientesService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { razonSocial, ruc, direccion, telefono, email, condicionPago } = req.body;
      if (!razonSocial || !ruc || !direccion) {
        R.badRequest(res, 'razonSocial, ruc y direccion son requeridos'); return;
      }
      const data = await clientesService.create({ razonSocial, ruc, direccion, telefono, email, condicionPago });
      R.created(res, data, 'Cliente creado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await clientesService.update(id, req.body);
      R.ok(res, data, 'Cliente actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está registrado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await clientesService.remove(id);
      R.ok(res, null, 'Cliente eliminado/desactivado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async estadisticas(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await clientesService.getEstadisticas(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const clientesController = new ClientesController();
