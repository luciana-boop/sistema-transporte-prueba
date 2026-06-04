// FILE: src/modules/configuracion/configuracion.controller.ts
// CAMBIOS:
//   - Agrega getUnidadesMedida(): GET /configuracion/facturacion/unidades-medida
//   - Agrega getCodigosFactura(): GET /configuracion/facturacion/codigos-factura
//   - El resto del controller NO se modifica

import { Request, Response } from 'express';
import { configuracionService } from './configuracion.service';
import * as R from '../../utils/response';

export class ConfiguracionController {

  // ── Inicializar ─────────────────────────────────────────────────────────────
  async inicializar(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await configuracionService.inicializarDefaults());
    } catch (e) { R.serverError(res, e); }
  }

  // ── Parámetros ──────────────────────────────────────────────────────────────
  async getParametros(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await configuracionService.getParametros());
    } catch (e) { R.serverError(res, e); }
  }

  async getParametro(req: Request, res: Response): Promise<void> {
    try {
      const valor = await configuracionService.getParametro(req.params.clave);
      if (valor === null) { R.notFound(res, 'Parámetro no encontrado'); return; }
      R.ok(res, { clave: req.params.clave, valor });
    } catch (e) { R.serverError(res, e); }
  }

  async updateParametro(req: Request, res: Response): Promise<void> {
    try {
      const { valor } = req.body;
      if (valor === undefined) { R.badRequest(res, 'valor es requerido'); return; }
      R.ok(res, await configuracionService.updateParametro(req.params.clave, String(valor)), 'Parámetro actualizado');
    } catch (e) { R.serverError(res, e); }
  }

  async updateParametrosBulk(req: Request, res: Response): Promise<void> {
    try {
      const params = req.body;
      if (!params || typeof params !== 'object') { R.badRequest(res, 'Body debe ser un objeto clave:valor'); return; }
      R.ok(res, await configuracionService.updateParametrosBulk(params), 'Parámetros actualizados');
    } catch (e) { R.serverError(res, e); }
  }

  // ── Series ──────────────────────────────────────────────────────────────────
  async getSeries(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getSeries()); } catch (e) { R.serverError(res, e); }
  }

  async getSeriesActivas(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getSeriesActivas()); } catch (e) { R.serverError(res, e); }
  }

  async createSerie(req: Request, res: Response): Promise<void> {
    try {
      const { serie, tipoDocumento, correlativoInicial, descripcion } = req.body;
      if (!serie) { R.badRequest(res, 'serie es requerida'); return; }
      R.created(res, await configuracionService.createSerie({ serie, tipoDocumento, correlativoInicial: correlativoInicial ? parseInt(correlativoInicial) : undefined, descripcion }), 'Serie creada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateSerie(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const dto = { ...req.body };
      if (dto.correlativoActual) dto.correlativoActual = parseInt(dto.correlativoActual);
      R.ok(res, await configuracionService.updateSerie(id, dto), 'Serie actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Serie no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteSerie(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await configuracionService.deleteSerie(id);
      R.ok(res, null, 'Serie eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Serie no encontrada') R.notFound(res, msg);
      else if (msg.includes('facturas')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── Categorías gasto ────────────────────────────────────────────────────────
  async getCategoriasGasto(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getCategoriasGasto()); } catch (e) { R.serverError(res, e); }
  }

  async createCategoriaGasto(req: Request, res: Response): Promise<void> {
    try {
      const { codigo, nombre, descripcion } = req.body;
      if (!codigo || !nombre) { R.badRequest(res, 'codigo y nombre son requeridos'); return; }
      R.created(res, await configuracionService.createCategoriaGasto({ codigo, nombre, descripcion }), 'Categoría creada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateCategoriaGasto(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await configuracionService.updateCategoriaGasto(id, req.body), 'Categoría actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Categoría no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteCategoriaGasto(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await configuracionService.deleteCategoriaGasto(id);
      R.ok(res, null, 'Categoría eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrada')) R.notFound(res, msg);
      else if (msg.includes('sistema')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── Alertas ─────────────────────────────────────────────────────────────────
  async getAlertas(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getAlertas()); } catch (e) { R.serverError(res, e); }
  }

  async updateAlerta(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const dto = { ...req.body };
      if (dto.diasAnticipacion) dto.diasAnticipacion = parseInt(dto.diasAnticipacion);
      R.ok(res, await configuracionService.updateAlerta(id, dto), 'Alerta actualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Alerta no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateAlertasBulk(req: Request, res: Response): Promise<void> {
    try {
      const { alertas } = req.body;
      if (!Array.isArray(alertas)) { R.badRequest(res, 'alertas debe ser un array'); return; }
      R.ok(res, await configuracionService.updateAlertasBulk(alertas), 'Alertas actualizadas');
    } catch (e) { R.serverError(res, e); }
  }

  // ── Tablas maestras ─────────────────────────────────────────────────────────
  async getTablaMaestra(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getTablaMaestra(req.params.tipo)); } catch (e) { R.serverError(res, e); }
  }

  async getTodosTipos(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getTodosTipos()); } catch (e) { R.serverError(res, e); }
  }

  async createTablaMaestra(req: Request, res: Response): Promise<void> {
    try {
      const { tipo, codigo, nombre, descripcion, extra, orden } = req.body;
      if (!tipo || !codigo || !nombre) { R.badRequest(res, 'tipo, codigo y nombre son requeridos'); return; }
      R.created(res, await configuracionService.createTablaMaestra({ tipo, codigo, nombre, descripcion, extra, orden: orden ? parseInt(orden) : undefined }), 'Registro creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe') || msg.includes('obligatorio')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateTablaMaestra(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await configuracionService.updateTablaMaestra(id, req.body), 'Registro actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteTablaMaestra(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await configuracionService.deleteTablaMaestra(id);
      R.ok(res, null, 'Registro eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Registro no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  // ── Unidades de medida (para Facturación) ───────────────────────────────────
  async getUnidadesMedida(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getUnidadesMedida()); } catch (e) { R.serverError(res, e); }
  }

  // ── Códigos de facturación (para Facturación) ───────────────────────────────
  async getCodigosFactura(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getCodigosFactura()); } catch (e) { R.serverError(res, e); }
  }

  // ── Tipos vehículo ──────────────────────────────────────────────────────────
  async getTiposVehiculo(req: Request, res: Response): Promise<void> {
    try { R.ok(res, await configuracionService.getTiposVehiculo()); } catch (e) { R.serverError(res, e); }
  }

  async createTipoVehiculo(req: Request, res: Response): Promise<void> {
    try {
      const { codigo, nombre, descripcion } = req.body;
      if (!codigo || !nombre) { R.badRequest(res, 'codigo y nombre son requeridos'); return; }
      R.created(res, await configuracionService.createTipoVehiculo({ codigo, nombre, descripcion }), 'Tipo creado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ya existe')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async updateTipoVehiculo(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await configuracionService.updateTipoVehiculo(id, req.body), 'Tipo actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Tipo no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async deleteTipoVehiculo(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await configuracionService.deleteTipoVehiculo(id);
      R.ok(res, null, 'Tipo eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Tipo no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const configuracionController = new ConfiguracionController();
