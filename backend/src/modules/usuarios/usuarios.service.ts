// FILE: backend/src/modules/usuarios/usuarios.service.ts
// CAMBIO: se agrega llamada a permisosService.inicializarPermisos()
// dentro de create(), solo cuando rol === SECRETARIO.
// Todo lo demás permanece idéntico.

import prisma from '../../prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Rol } from '../../utils/enums';
import { permisosService } from '../permisos/permisos.service';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface HorarioAccesoDto {
  restriccionHorarioActiva?: boolean;
  diasPermitidos?: number[];
  horaInicio?: string | null;
  horaFin?: string | null;
}

export interface CreateUsuarioDto extends HorarioAccesoDto {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
  conductorId?: number | null;
}

export interface UpdateUsuarioDto extends HorarioAccesoDto {
  nombre?: string;
  email?: string;
  rol?: Rol;
  activo?: boolean;
  conductorId?: number | null;
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
          restriccionHorarioActiva: true,
          diasPermitidos: true,
          horaInicio: true,
          horaFin: true,
          conductorId: true,
          accessTokenHash: true,
        },
        orderBy: { creadoEn: 'desc' },
        skip,
        take,
      }),
    ]);
    return { items: items.map(this.ocultarAccessTokenHash), total, page, limit };
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
        restriccionHorarioActiva: true,
        diasPermitidos: true,
        horaInicio: true,
        horaFin: true,
        conductorId: true,
        accessTokenHash: true,
      },
    });
    if (!usuario) throw new Error('Usuario no encontrado');
    return this.ocultarAccessTokenHash(usuario);
  }

  // El hash del link fijo nunca sale de este service — solo se expone si el
  // usuario tiene uno generado (tieneLinkAcceso), nunca el valor en sí.
  private ocultarAccessTokenHash<T extends { accessTokenHash: string | null }>(
    usuario: T,
  ): Omit<T, 'accessTokenHash'> & { tieneLinkAcceso: boolean } {
    const { accessTokenHash, ...resto } = usuario;
    return { ...resto, tieneLinkAcceso: !!accessTokenHash };
  }

  // Un CHOFER debe estar vinculado a una ficha de Conductor existente y sin
  // otro usuario ya asociado (Usuario.conductorId es @unique).
  private async validarConductorParaChofer(conductorId: number | null | undefined, usuarioIdActual?: number) {
    if (!conductorId) throw new Error('conductorId es requerido cuando el rol es CHOFER');
    const conductor = await prisma.conductor.findUnique({
      where: { id: conductorId },
      include: { usuarioChofer: { select: { id: true } } },
    });
    if (!conductor) throw new Error('Conductor no encontrado');
    if (conductor.usuarioChofer && conductor.usuarioChofer.id !== usuarioIdActual) {
      throw new Error('Ese conductor ya tiene un usuario vinculado');
    }
  }

  async create(dto: CreateUsuarioDto) {
    const existente = await prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new Error(`El email ${dto.email} ya está registrado`);

    if (dto.rol === Rol.CHOFER) {
      await this.validarConductorParaChofer(dto.conductorId);
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const usuario = await prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        rol: dto.rol,
        restriccionHorarioActiva: dto.restriccionHorarioActiva,
        diasPermitidos: dto.diasPermitidos,
        horaInicio: dto.horaInicio,
        horaFin: dto.horaFin,
        conductorId: dto.rol === Rol.CHOFER ? dto.conductorId : undefined,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        creadoEn: true,
        restriccionHorarioActiva: true,
        diasPermitidos: true,
        horaInicio: true,
        horaFin: true,
        conductorId: true,
      },
    });

    // ── Inicializar permisos por defecto según el rol ──
    // ADMIN no necesita registros en BD (siempre tiene todo).
    if (dto.rol === Rol.SECRETARIO) {
      await permisosService.inicializarPermisos(usuario.id);
    } else if (dto.rol === Rol.CHOFER) {
      await permisosService.inicializarPermisosChofer(usuario.id);
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

    if (dto.rol === Rol.CHOFER) {
      await this.validarConductorParaChofer(dto.conductorId, id);
    }

    return prisma.usuario.update({
      where: { id },
      data: {
        ...dto,
        conductorId: dto.rol === Rol.CHOFER ? dto.conductorId : (dto.rol ? null : undefined),
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        actualizadoEn: true,
        restriccionHorarioActiva: true,
        diasPermitidos: true,
        horaInicio: true,
        horaFin: true,
        conductorId: true,
      },
    });
  }

  // ── Intentos de acceso denegados por horario (solo para notificaciones ADMIN) ──
  async getIntentosFueraHorario(limite = 20) {
    return prisma.logActividad.findMany({
      where: { accion: { in: ['LOGIN_DENEGADO_HORARIO', 'ACCESO_DENEGADO_HORARIO'] } },
      orderBy: { fechaHora: 'desc' },
      take: limite,
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
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

  // Genera (o regenera) el link/QR fijo de acceso de un chofer. Devuelve el
  // token en texto plano UNA sola vez — solo se guarda su hash SHA-256.
  // Regenerar invalida automáticamente el link anterior (se sobreescribe el hash).
  async generarLinkAcceso(id: number): Promise<string> {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new Error('Usuario no encontrado');
    if (usuario.rol !== Rol.CHOFER) {
      throw new Error('El link de acceso solo aplica a usuarios con rol CHOFER');
    }

    const tokenPlano = crypto.randomBytes(32).toString('hex');
    const accessTokenHash = crypto.createHash('sha256').update(tokenPlano).digest('hex');

    await prisma.usuario.update({ where: { id }, data: { accessTokenHash } });
    return tokenPlano;
  }

  async revocarLinkAcceso(id: number): Promise<void> {
    await this.findById(id);
    await prisma.usuario.update({ where: { id }, data: { accessTokenHash: null } });
  }

  async remove(id: number, adminId: number) {
    if (id === adminId) throw new Error('No puede eliminar su propio usuario');
    await this.findById(id);
    // Los permisos se eliminan automáticamente por el CASCADE de la FK
    return prisma.usuario.delete({ where: { id } });
  }
}

export const usuariosService = new UsuariosService();
