// FILE: src/auth/auth.service.ts

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma/client';
import { LoginDto, AuthResponse, JwtPayload, AccesoLinkFijoDto } from './auth.types';
import { Rol } from '../utils/enums';
import { dentroDeHorario } from '../utils/horario';

export class AuthService {
  // Hash ficticio usado para garantizar tiempo constante cuando el usuario no existe.
  // Evita que un atacante pueda enumerar emails midiendo tiempos de respuesta.
  private static readonly DUMMY_HASH =
    '$2a$12$invalidhashusedtoconstanttimeXXXXXXXXXXXXXXXXXXXXXXXX';

  // Firma el JWT de sesión y genera el csrfToken. Común a login por
  // email+password y a login por link fijo (chofer) — cada flujo decide su
  // propio expiresIn.
  private emitirSesion(
    usuario: { id: number; email: string; rol: Rol; nombre: string },
    expiresIn: string,
  ): AuthResponse {
    const payload: JwtPayload = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no configurado');

    const token = jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
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

    return this.emitirSesion(usuario, process.env.JWT_EXPIRES_IN || '2h');
  }

  // Canjea el link/QR fijo de acceso de un chofer por una sesión real. El
  // token nunca se guarda en texto plano (ver accessTokenHash en el schema),
  // así que acá se hashea el valor recibido y se busca por el hash.
  async loginConLinkFijo(dto: AccesoLinkFijoDto): Promise<AuthResponse> {
    const accessTokenHash = crypto.createHash('sha256').update(dto.tokenPlano).digest('hex');

    const usuario = await prisma.usuario.findUnique({ where: { accessTokenHash } });

    if (!usuario || usuario.rol !== Rol.CHOFER) {
      throw new Error('Link inválido o revocado. Solicite uno nuevo al administrador.');
    }

    if (!usuario.activo) {
      throw new Error('Usuario desactivado. Contacte al administrador');
    }

    if (usuario.restriccionHorarioActiva && !dentroDeHorario(usuario)) {
      await prisma.logActividad.create({
        data: {
          usuarioId: usuario.id,
          accion: 'ACCESO_LINK_FIJO_DENEGADO_HORARIO',
          modulo: 'AUTH',
          detalle: 'Intento de acceso por link fijo fuera del horario permitido',
          ip: dto.ip,
        },
      });
      throw new Error('Fuera del horario permitido para su usuario. Contacte al administrador.');
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
    });

    await prisma.logActividad.create({
      data: {
        usuarioId: usuario.id,
        accion: 'LOGIN',
        modulo: 'AUTH',
        detalle: 'Inicio de sesión vía link fijo (chofer)',
        ip: dto.ip,
      },
    });

    return this.emitirSesion(usuario, process.env.LINK_FIJO_EXPIRES_IN || '90d');
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
