// FILE: src/auth/auth.service.ts

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma/client';
import { LoginDto, AuthResponse, JwtPayload } from './auth.types';
import { Rol } from '../utils/enums';
import { dentroDeHorario } from '../utils/horario';

export class AuthService {
  // Hash ficticio usado para garantizar tiempo constante cuando el usuario no existe.
  // Evita que un atacante pueda enumerar emails midiendo tiempos de respuesta.
  private static readonly DUMMY_HASH =
    '$2a$12$invalidhashusedtoconstanttimeXXXXXXXXXXXXXXXXXXXXXXXX';

  async login(dto: LoginDto): Promise<AuthResponse> {
    const usuario = await prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    // Siempre ejecutar bcrypt.compare (aunque el usuario no exista) para que
    // el tiempo de respuesta sea igual en ambos casos y no filtre qué emails
    // están registrados.
    const hashAComparar = usuario?.passwordHash ?? AuthService.DUMMY_HASH;
    const passwordValido = await bcrypt.compare(dto.password, hashAComparar);

    if (!usuario || !passwordValido) {
      throw new Error('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new Error('Usuario desactivado. Contacte al administrador');
    }

    // ADMIN nunca se restringe por horario (son los jefes/gerencia).
    if (
      usuario.rol !== Rol.ADMIN &&
      usuario.restriccionHorarioActiva &&
      !dentroDeHorario(usuario)
    ) {
      await prisma.logActividad.create({
        data: {
          usuarioId: usuario.id,
          accion: 'LOGIN_DENEGADO_HORARIO',
          modulo: 'AUTH',
          detalle: 'Intento de inicio de sesión fuera del horario permitido',
          ip: dto.ip,
        },
      });
      throw new Error('Fuera del horario permitido para su usuario. Contacte al administrador.');
    }

    // Actualizar último acceso
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
    });

    // Registrar log
    await prisma.logActividad.create({
      data: {
        usuarioId: usuario.id,
        accion: 'LOGIN',
        modulo: 'AUTH',
        detalle: `Inicio de sesión exitoso`,
      },
    });

    const payload: JwtPayload = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no configurado');

    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    } as jwt.SignOptions);

    const csrfToken = crypto.randomBytes(32).toString('hex');

    return {
      token,
      csrfToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }

  async getProfile(usuarioId: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        ultimoAcceso: true,
        creadoEn: true,
      },
    });

    if (!usuario) throw new Error('Usuario no encontrado');
    return usuario;
  }
}

export const authService = new AuthService();
