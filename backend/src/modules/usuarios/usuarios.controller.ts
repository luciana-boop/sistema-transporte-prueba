// FILE: src/modules/usuarios/usuarios.controller.ts

import { Request, Response } from 'express';
import { usuariosService } from './usuarios.service';
import { Rol } from '../../utils/enums';
import * as R from '../../utils/response';

export class UsuariosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const data = await usuariosService.findAll();
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await usuariosService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { nombre, email, password, rol } = req.body;
      if (!nombre || !email || !password || !rol) {
        R.badRequest(res, 'nombre, email, password y rol son requeridos'); return;
      }
      if (!Object.values(Rol).includes(rol)) {
        R.badRequest(res, `rol inválido. Valores: ${Object.values(Rol).join(', ')}`); return;
      }
      if (password.length < 6) {
        R.badRequest(res, 'La contraseña debe tener al menos 6 caracteres'); return;
      }
      const data = await usuariosService.create({ nombre, email, password, rol });
      R.created(res, data, 'Usuario creado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya está registrado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { nombre, email, rol, activo } = req.body;
      const data = await usuariosService.update(id, { nombre, email, rol, activo });
      R.ok(res, data, 'Usuario actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está en uso')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async cambiarPassword(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { password } = req.body;
      if (!password) { R.badRequest(res, 'password es requerido'); return; }
      const data = await usuariosService.cambiarPassword(id, password);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('al menos')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await usuariosService.remove(id, req.usuario!.id);
      R.ok(res, null, 'Usuario eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('propio')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const usuariosController = new UsuariosController();
