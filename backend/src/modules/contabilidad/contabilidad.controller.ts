// FILE: src/modules/contabilidad/contabilidad.controller.ts

import { Request, Response } from 'express';
import {
  cuentasContablesService,
  asientosService,
  reportesContablesService,
  configContableService,
  mapeoContableService,
} from './contabilidad.service';
import * as R from '../../utils/response';

// ─── CUENTAS CONTABLES ────────────────────────────────────────────────────────

export class CuentasContablesController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { tipo, activa } = req.query as Record<string, string>;
      R.ok(res, await cuentasContablesService.findAll({ tipo, activa }));
    } catch (e) { R.serverError(res, e); }
  }

  async arbol(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await cuentasContablesService.findTree());
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await cuentasContablesService.findById(req.params.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { codigo, nombre, tipo, naturaleza } = req.body;
      if (!codigo || !nombre || !tipo || !naturaleza) {
        R.badRequest(res, 'codigo, nombre, tipo y naturaleza son requeridos');
        return;
      }
      R.created(res, await cuentasContablesService.create(req.body), 'Cuenta creada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Ya existe') || msg.includes('no encontrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await cuentasContablesService.update(req.params.id, req.body), 'Cuenta actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else if (msg.includes('Ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      await cuentasContablesService.remove(req.params.id);
      R.ok(res, null, 'Cuenta eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else if (msg.includes('No se puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

// ─── ASIENTOS CONTABLES ───────────────────────────────────────────────────────

export class AsientosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, tipo, cuentaId, referencia, page, limit } = req.query as Record<string, string>;
      R.ok(res, await asientosService.findAll({ desde, hasta, tipo, cuentaId, referencia, page, limit }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await asientosService.findById(req.params.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { fecha, descripcion, lineas } = req.body;
      if (!fecha || !descripcion || !Array.isArray(lineas) || lineas.length === 0) {
        R.badRequest(res, 'fecha, descripcion y lineas son requeridos');
        return;
      }
      R.created(res, await asientosService.create(req.body), 'Asiento creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('balanceado') || msg.includes('no encontradas') || msg.includes('al menos')) {
        R.badRequest(res, msg);
      } else { R.serverError(res, e); }
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      await asientosService.remove(req.params.id);
      R.ok(res, null, 'Asiento eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else if (msg.includes('automáticos')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

// ─── REPORTES CONTABLES ───────────────────────────────────────────────────────

export class ReportesContablesController {
  async libroMayor(req: Request, res: Response): Promise<void> {
    try {
      const { cuentaId } = req.params;
      const { desde, hasta } = req.query as Record<string, string>;
      if (!cuentaId) { R.badRequest(res, 'cuentaId es requerido'); return; }
      R.ok(res, await reportesContablesService.getLibroMayor(cuentaId, { desde, hasta }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async balanceComprobacion(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await reportesContablesService.getBalanceComprobacion({ desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async estadoResultados(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta } = req.query as Record<string, string>;
      R.ok(res, await reportesContablesService.getEstadoResultados({ desde, hasta }));
    } catch (e) { R.serverError(res, e); }
  }

  async balanceGeneral(req: Request, res: Response): Promise<void> {
    try {
      const { fecha } = req.query as Record<string, string>;
      R.ok(res, await reportesContablesService.getBalanceGeneral({ fecha }));
    } catch (e) { R.serverError(res, e); }
  }
}

// ─── CONFIGURACIÓN CONTABLE ───────────────────────────────────────────────────

export class ConfigContableController {
  async listar(_req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await configContableService.findAll());
    } catch (e) { R.serverError(res, e); }
  }

  async set(req: Request, res: Response): Promise<void> {
    try {
      const { clave, cuentaId } = req.body;
      if (!clave || !cuentaId) { R.badRequest(res, 'clave y cuentaId son requeridos'); return; }
      R.ok(res, await configContableService.set(clave, cuentaId), 'Configuración guardada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      await configContableService.remove(req.params.clave);
      R.ok(res, null, 'Configuración eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

// ─── MAPEO CATEGORÍAS → CUENTAS CONTABLES ─────────────────────────────────────

export class MapeoContableController {
  async listar(_req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await mapeoContableService.findAll());
    } catch (e) { R.serverError(res, e); }
  }

  async set(req: Request, res: Response): Promise<void> {
    try {
      const { modulo, categoriaSlug, categoriaNombre, cuentaContableId } = req.body;
      if (!modulo || !categoriaSlug || !categoriaNombre || !cuentaContableId) {
        R.badRequest(res, 'modulo, categoriaSlug, categoriaNombre y cuentaContableId son requeridos');
        return;
      }
      R.ok(res, await mapeoContableService.set(modulo, categoriaSlug, categoriaNombre, cuentaContableId), 'Mapeo guardado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const cuentasContablesController = new CuentasContablesController();
export const asientosController = new AsientosController();
export const reportesContablesController = new ReportesContablesController();
export const configContableController = new ConfigContableController();
export const mapeoContableController = new MapeoContableController();
