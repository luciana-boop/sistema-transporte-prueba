// FILE: src/modules/usuarios/usuarios.controller.ts

import { Request, Response } from 'express';
import { usuariosService } from './usuarios.service';
import { Rol } from '../../utils/enums';
import * as R from '../../utils/response';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Valida los campos de horario si vienen presentes en el body. Devuelve un
// mensaje de error o null si todo está bien.
function validarHorario(body: Record<string, unknown>): string | null {
  if (body.diasPermitidos !== undefined) {
    if (
      !Array.isArray(body.diasPermitidos) ||
      body.diasPermitidos.some((d: unknown) => typeof d !== 'number' || d < 1 || d > 7)
    ) {
      return 'diasPermitidos debe ser un array de números entre 1 (Lunes) y 7 (Domingo)';
    }
  }
  if (body.horaInicio !== null && body.horaInicio !== undefined && !HORA_REGEX.test(body.horaInicio as string)) {
    return 'horaInicio debe tener formato HH:mm';
  }
  if (body.horaFin !== null && body.horaFin !== undefined && !HORA_REGEX.test(body.horaFin as string)) {
    return 'horaFin debe tener formato HH:mm';
  }
  return null;
}

export class UsuariosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit } = req.query as Record<string, string>;
      const data = await usuariosService.findAll({ page, limit });
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
      const { nombre, email, password, rol, restriccionHorarioActiva, diasPermitidos, horaInicio, horaFin, conductorId } = req.body;
      if (!nombre || !email || !password || !rol) {
        R.badRequest(res, 'nombre, email, password y rol son requeridos'); return;
      }
      if (!Object.values(Rol).includes(rol)) {
        R.badRequest(res, `rol inválido. Valores: ${Object.values(Rol).join(', ')}`); return;
      }
      if (password.length < 8) {
        R.badRequest(res, 'La contraseña debe tener al menos 8 caracteres'); return;
      }
      const errorHorario = validarHorario(req.body);
      if (errorHorario) { R.badRequest(res, errorHorario); return; }
      const data = await usuariosService.create({
        nombre, email, password, rol, restriccionHorarioActiva, diasPermitidos, horaInicio, horaFin,
        conductorId: conductorId ? Number(conductorId) : undefined,
      });
      R.created(res, data, 'Usuario creado correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya está registrado') || msg.includes('conductorId es requerido') || msg === 'Conductor no encontrado' || msg.includes('ya tiene un usuario vinculado')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { nombre, email, rol, activo, restriccionHorarioActiva, diasPermitidos, horaInicio, horaFin, conductorId } = req.body;
      const errorHorario = validarHorario(req.body);
      if (errorHorario) { R.badRequest(res, errorHorario); return; }
      const data = await usuariosService.update(id, {
        nombre, email, rol, activo, restriccionHorarioActiva, diasPermitidos, horaInicio, horaFin,
        conductorId: conductorId ? Number(conductorId) : conductorId,
      });
      R.ok(res, data, 'Usuario actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('ya está en uso') || msg.includes('conductorId es requerido') || msg === 'Conductor no encontrado' || msg.includes('ya tiene un usuario vinculado')) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async intentosFueraHorario(req: Request, res: Response): Promise<void> {
    try {
      const data = await usuariosService.getIntentosFueraHorario();
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
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

  async generarLinkAcceso(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const token = await usuariosService.generarLinkAcceso(id);
      R.ok(res, { token });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
      else if (msg.includes('solo aplica')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async revocarLinkAcceso(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await usuariosService.revocarLinkAcceso(id);
      R.ok(res, null, 'Link de acceso revocado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Usuario no encontrado') R.notFound(res, msg);
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
