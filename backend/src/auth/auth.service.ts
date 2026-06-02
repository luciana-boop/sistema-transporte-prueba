// FILE: src/auth/auth.service.ts

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { LoginDto, AuthResponse, JwtPayload } from './auth.types';

export class AuthService {
  async login(dto: LoginDto): Promise<AuthResponse> {
    const usuario = await prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario) {
      throw new Error('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new Error('Usuario desactivado. Contacte al administrador');
    }

    const passwordValido = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!passwordValido) {
      throw new Error('Credenciales inválidas');
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
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    } as jwt.SignOptions);

    return {
      token,
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
