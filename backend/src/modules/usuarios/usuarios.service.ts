// FILE: backend/src/modules/usuarios/usuarios.service.ts
// CAMBIO: se agrega llamada a permisosService.inicializarPermisos()
// dentro de create(), solo cuando rol === SECRETARIO.
// Todo lo demás permanece idéntico.

import prisma from '../../prisma/client';
import bcrypt from 'bcryptjs';
import { Rol } from '../../utils/enums';
import { permisosService } from '../permisos/permisos.service';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreateUsuarioDto {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
}

export interface UpdateUsuarioDto {
  nombre?: string;
  email?: string;
  rol?: Rol;
  activo?: boolean;
}

export class UsuariosService {
  async findAll(query: PaginacionQuery = {}) {
    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.findMany({
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          ultimoAcceso: true,
          creadoEn: true,
        },
        orderBy: { creadoEn: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        ultimoAcceso: true,
        creadoEn: true,
        actualizadoEn: true,
      },
    });
    if (!usuario) throw new Error('Usuario no encontrado');
    return usuario;
  }

  async create(dto: CreateUsuarioDto) {
    const existente = await prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new Error(`El email ${dto.email} ya está registrado`);

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const usuario = await prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        rol: dto.rol,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        creadoEn: true,
      },
    });

    // ── NUEVO: inicializar permisos por defecto para secretarios ──
    // ADMIN no necesita registros en BD (siempre tiene todo).
    if (dto.rol === Rol.SECRETARIO) {
      await permisosService.inicializarPermisos(usuario.id);
    }
    // ─────────────────────────────────────────────────────────────

    return usuario;
  }

  async update(id: number, dto: UpdateUsuarioDto) {
    await this.findById(id);

    if (dto.email) {
      const existente = await prisma.usuario.findFirst({
        where: { email: dto.email, id: { not: id } },
      });
      if (existente) throw new Error(`El email ${dto.email} ya está en uso`);
    }

    return prisma.usuario.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        actualizadoEn: true,
      },
    });
  }

  async cambiarPassword(id: number, nuevaPassword: string) {
    await this.findById(id);
    if (nuevaPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const passwordHash = await bcrypt.hash(nuevaPassword, rounds);
    await prisma.usuario.update({ where: { id }, data: { passwordHash } });
    return { message: 'Contraseña actualizada correctamente' };
  }

  async remove(id: number, adminId: number) {
    if (id === adminId) throw new Error('No puede eliminar su propio usuario');
    await this.findById(id);
    // Los permisos se eliminan automáticamente por el CASCADE de la FK
    return prisma.usuario.delete({ where: { id } });
  }
}

export const usuariosService = new UsuariosService();
