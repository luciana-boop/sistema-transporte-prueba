// FILE: src/modules/clientes/clientes.controller.ts

import { Request, Response } from 'express';
import { clientesService } from './clientes.service';
import * as R from '../../utils/response';

export class ClientesController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { activo, search, page, limit } = req.query as Record<string, string>;
      const data = await clientesService.findAll({ activo, search, page, limit });
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
      const { razonSocial, ruc, direccion, ubigeo, telefono, email, condicionPago } = req.body;
      if (!razonSocial || !ruc || !direccion) {
        R.badRequest(res, 'razonSocial, ruc y direccion son requeridos'); return;
      }
      const data = await clientesService.create({ razonSocial, ruc, direccion, ubigeo, telefono, email, condicionPago }, req.usuario!.id);
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
      const data = await clientesService.update(id, req.body, req.usuario!.id);
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

  async agregarContacto(req: Request, res: Response): Promise<void> {
    try {
      const clienteId = parseInt(req.params.id);
      if (isNaN(clienteId)) { R.badRequest(res, 'ID inválido'); return; }
      const { nombre, telefono, email } = req.body;
      if (!nombre) { R.badRequest(res, 'nombre es requerido'); return; }
      const data = await clientesService.agregarContacto(clienteId, { nombre, telefono, email });
      R.created(res, data, 'Contacto agregado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Cliente no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizarContacto(req: Request, res: Response): Promise<void> {
    try {
      const contactoId = parseInt(req.params.contactoId);
      if (isNaN(contactoId)) { R.badRequest(res, 'ID inválido'); return; }
      const { nombre, telefono, email } = req.body;
      const data = await clientesService.actualizarContacto(contactoId, { nombre, telefono, email });
      R.ok(res, data, 'Contacto actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Contacto no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminarContacto(req: Request, res: Response): Promise<void> {
    try {
      const contactoId = parseInt(req.params.contactoId);
      if (isNaN(contactoId)) { R.badRequest(res, 'ID inválido'); return; }
      await clientesService.eliminarContacto(contactoId);
      R.ok(res, null, 'Contacto eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Contacto no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const clientesController = new ClientesController();
