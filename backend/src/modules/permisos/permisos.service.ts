// FILE: backend/src/modules/permisos/permisos.service.ts

import prisma from '../../prisma/client';
import {
  MODULOS,
  TODOS_LOS_MODULOS,
  TODAS_LAS_ACCIONES,
  ModuloKey,
  AccionKey,
} from '../../config/permisos.config';

export interface PermisosUsuario {
  modulos:  ModuloKey[];   // lista de moduloKey habilitados
  acciones: AccionKey[];   // lista de accionKey habilitadas
}

export interface GuardarPermisosDto {
  modulos:  { key: ModuloKey;  habilitado: boolean }[];
  acciones: { key: AccionKey;  habilitado: boolean }[];
}

export class PermisosService {

  // ─── Obtener permisos de un usuario ────────────────────────────────────────
  // Si es ADMIN → todo habilitado sin consultar BD.
  // Si es SECRETARIO → lee las tablas de permisos.
  async obtenerPermisos(usuarioId: number): Promise<PermisosUsuario> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });

    if (!usuario) throw new Error('Usuario no encontrado');

    // ADMIN siempre tiene acceso total
    if (usuario.rol === 'ADMIN') {
      return {
        modulos:  [...TODOS_LOS_MODULOS],
        acciones: [...TODAS_LAS_ACCIONES],
      };
    }

    // SECRETARIO: leer desde BD
    const [permisosModulos, permisosAcciones] = await Promise.all([
      prisma.permisoModulo.findMany({
        where: { usuarioId, habilitado: true },
        select: { moduloKey: true },
      }),
      prisma.permisoAccion.findMany({
        where: { usuarioId, habilitado: true },
        select: { accionKey: true },
      }),
    ]);

    return {
      modulos:  permisosModulos.map((p) => p.moduloKey as ModuloKey),
      acciones: permisosAcciones.map((p) => p.accionKey as AccionKey),
    };
  }

  // ─── Obtener permisos completos (con estado habilitado/deshabilitado) ───────
  // Para la UI de administración — el admin necesita ver el estado de cada item.
  async obtenerPermisosCompletos(usuarioId: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true, nombre: true, email: true },
    });

    if (!usuario) throw new Error('Usuario no encontrado');

    // Si es ADMIN no tiene sentido editar sus permisos
    if (usuario.rol === 'ADMIN') {
      return {
        usuario,
        esAdmin: true,
        modulos:  TODOS_LOS_MODULOS.map((key) => ({ key, habilitado: true })),
        acciones: TODAS_LAS_ACCIONES.map((key) => ({ key, habilitado: true })),
      };
    }

    // Buscar registros existentes en BD
    const [permisosModulos, permisosAcciones] = await Promise.all([
      prisma.permisoModulo.findMany({
        where: { usuarioId },
        select: { moduloKey: true, habilitado: true },
      }),
      prisma.permisoAccion.findMany({
        where: { usuarioId },
        select: { accionKey: true, habilitado: true },
      }),
    ]);

    // Construir mapas para lookup O(1)
    const mapaModulos  = new Map(permisosModulos.map((p) => [p.moduloKey,  p.habilitado]));
    const mapaAcciones = new Map(permisosAcciones.map((p) => [p.accionKey, p.habilitado]));

    // Devolver todos los módulos/acciones con su estado actual
    // Si no existe registro en BD todavía, usar el default del config
    return {
      usuario,
      esAdmin: false,
      modulos: TODOS_LOS_MODULOS.map((key) => ({
        key,
        habilitado: mapaModulos.has(key) ? mapaModulos.get(key)! : true,
      })),
      acciones: TODAS_LAS_ACCIONES.map((key) => ({
        key,
        habilitado: mapaAcciones.has(key) ? mapaAcciones.get(key)! : false,
      })),
    };
  }

  // ─── Guardar permisos (upsert) ──────────────────────────────────────────────
  // Idempotente: se puede llamar múltiples veces con el mismo resultado.
  // Usa upsert para no borrar y reinsertar (evita race conditions).
  async guardarPermisos(usuarioId: number, dto: GuardarPermisosDto): Promise<void> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });

    if (!usuario) throw new Error('Usuario no encontrado');
    if (usuario.rol === 'ADMIN') throw new Error('No se pueden modificar permisos de un ADMIN');

    // Upsert de módulos en paralelo
    await Promise.all(
      dto.modulos.map((m) =>
        prisma.permisoModulo.upsert({
          where:  { usuarioId_moduloKey: { usuarioId, moduloKey: m.key } },
          create: { usuarioId, moduloKey: m.key, habilitado: m.habilitado },
          update: { habilitado: m.habilitado },
        })
      )
    );

    // Upsert de acciones en paralelo
    await Promise.all(
      dto.acciones.map((a) =>
        prisma.permisoAccion.upsert({
          where:  { usuarioId_accionKey: { usuarioId, accionKey: a.key } },
          create: { usuarioId, accionKey: a.key, habilitado: a.habilitado },
          update: { habilitado: a.habilitado },
        })
      )
    );
  }

  // ─── Inicializar permisos por defecto ───────────────────────────────────────
  // Se llama al crear un SECRETARIO nuevo.
  // Módulos: todos habilitados (puede ver todo por defecto).
  // Acciones: todas deshabilitadas (mínimo privilegio para anulaciones).
  async inicializarPermisos(usuarioId: number): Promise<void> {
    await Promise.all([
      // Crear registros de módulos (todos habilitados)
      ...TODOS_LOS_MODULOS.map((key) =>
        prisma.permisoModulo.upsert({
          where:  { usuarioId_moduloKey: { usuarioId, moduloKey: key } },
          create: { usuarioId, moduloKey: key, habilitado: true },
          update: {}, // si ya existe, no cambiar
        })
      ),
      // Crear registros de acciones (todas deshabilitadas)
      ...TODAS_LAS_ACCIONES.map((key) =>
        prisma.permisoAccion.upsert({
          where:  { usuarioId_accionKey: { usuarioId, accionKey: key } },
          create: { usuarioId, accionKey: key, habilitado: false },
          update: {}, // si ya existe, no cambiar
        })
      ),
    ]);
  }

  // ─── Inicializar permisos por defecto para un CHOFER ────────────────────────
  // A diferencia de inicializarPermisos() (SECRETARIO: todos los módulos
  // habilitados), un CHOFER solo debe poder ver "Guías (Chofer)". Se crean
  // registros explícitos en false para el resto para que la pantalla de
  // permisos del admin no muestre el default engañoso (ver
  // obtenerPermisosCompletos) y para que un "Guardar" sin cambios no termine
  // habilitando todo.
  async inicializarPermisosChofer(usuarioId: number): Promise<void> {
    await Promise.all([
      ...TODOS_LOS_MODULOS.map((key) =>
        prisma.permisoModulo.upsert({
          where:  { usuarioId_moduloKey: { usuarioId, moduloKey: key } },
          create: { usuarioId, moduloKey: key, habilitado: key === MODULOS.GUIAS_CHOFER },
          update: {},
        })
      ),
      ...TODAS_LAS_ACCIONES.map((key) =>
        prisma.permisoAccion.upsert({
          where:  { usuarioId_accionKey: { usuarioId, accionKey: key } },
          create: { usuarioId, accionKey: key, habilitado: false },
          update: {},
        })
      ),
    ]);
  }

  // ─── Verificar permiso de módulo (para middleware) ──────────────────────────
  // `rol` viene del JWT ya verificado (req.usuario.rol) — evita una consulta
  // redundante a `usuario` que antes se hacía en cada request solo para
  // volver a leer un dato que el token ya trae firmado.
  async tienePermisoModulo(usuarioId: number, moduloKey: string, rol: string): Promise<boolean> {
    if (rol === 'ADMIN') return true;

    const permiso = await prisma.permisoModulo.findUnique({
      where: { usuarioId_moduloKey: { usuarioId, moduloKey } },
      select: { habilitado: true },
    });

    // Si no existe registro, por defecto se deniega
    return permiso?.habilitado ?? false;
  }

  // ─── Verificar permiso de acción (para middleware) ──────────────────────────
  async tienePermisoAccion(usuarioId: number, accionKey: string, rol: string): Promise<boolean> {
    if (rol === 'ADMIN') return true;

    const permiso = await prisma.permisoAccion.findUnique({
      where: { usuarioId_accionKey: { usuarioId, accionKey } },
      select: { habilitado: true },
    });

    // Si no existe registro, por defecto se deniega
    return permiso?.habilitado ?? false;
  }
}

export const permisosService = new PermisosService();
