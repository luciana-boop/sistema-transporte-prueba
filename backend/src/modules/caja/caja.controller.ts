// FILE: src/modules/caja/caja.controller.ts

import { Request, Response } from 'express';
import { cajaService } from './caja.service';
import { TipoMovimientoCaja } from '../../utils/enums';
import * as R from '../../utils/response';

export class CajaController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, usuarioId, desde, hasta, page, limit } = req.query as Record<string, string>;
      const data = await cajaService.findAll({ estado, usuarioId, desde, hasta, page, limit });
      R.ok(res, data);
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.findById(id);
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async generarPdf(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const caja = await cajaService.findById(id);
      const fs = require('fs');
      const path = require('path');
      const { generarPdfReporteCaja } = await import('../pdf/caja-pdf.generator');
      const rutaRel = await generarPdfReporteCaja(caja);
      const rutaAbs = path.join(process.cwd(), rutaRel);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="caja-${caja.id}.pdf"`);
      fs.createReadStream(rutaAbs).pipe(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async cajaActual(req: Request, res: Response): Promise<void> {
    try {
      const data = await cajaService.cajaActual(req.usuario!.id);
      R.ok(res, data ?? null);
    } catch (e) { R.serverError(res, e); }
  }

  async abrir(req: Request, res: Response): Promise<void> {
    try {
      const { movimientoCuentaId, nombre, observaciones } = req.body;
      if (!movimientoCuentaId) { R.badRequest(res, 'Debe seleccionar un egreso de caja chica'); return; }
      const data = await cajaService.abrir(
        { movimientoCuentaId: parseInt(movimientoCuentaId), nombre, observaciones },
        req.usuario!.id
      );
      R.created(res, data, 'Caja abierta correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('Ya existe') ||
        msg.includes('no encontrado') ||
        msg.includes('no encontrada') ||
        msg.includes('inactiva') ||
        msg.includes('anulado') ||
        msg.includes('ya fue usado') ||
        msg.includes('no es un egreso') ||
        msg.includes('Debe seleccionar')
      ) {
        R.badRequest(res, msg);
      } else R.serverError(res, e);
    }
  }

  async egresosDisponibles(req: Request, res: Response): Promise<void> {
    try {
      R.ok(res, await cajaService.egresosDisponibles());
    } catch (e) { R.serverError(res, e); }
  }

  async cerrar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { saldoCierre, observaciones, cuentaDestinoId, referencia } = req.body;
      if (saldoCierre === undefined) { R.badRequest(res, 'saldoCierre es requerido'); return; }
      const data = await cajaService.cerrar(
        id,
        {
          saldoCierre: parseFloat(saldoCierre),
          observaciones,
          cuentaDestinoId: cuentaDestinoId ? parseInt(cuentaDestinoId) : undefined,
          referencia,
        },
        req.usuario!.id
      );
      R.ok(res, data, 'Caja cerrada correctamente');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (
        msg.includes('ya está') || msg.includes('No puede') || msg.includes('ya fue devuelto') ||
        msg.includes('no encontrada') || msg.includes('inactiva') || msg.includes('Saldo insuficiente') ||
        msg.includes('Debe indicar') || msg.includes('No se encontró') || msg.includes('Hay más de un')
      ) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async registrarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { tipo, monto, concepto, fecha, referencia, categoriaEgreso, vehiculoId } = req.body;
      if (!tipo || !monto || !concepto) { R.badRequest(res, 'tipo, monto y concepto son requeridos'); return; }
      if (!Object.values(TipoMovimientoCaja).includes(tipo)) {
        R.badRequest(res, `tipo inválido. Valores: ${Object.values(TipoMovimientoCaja).join(', ')}`); return;
      }
      if (tipo === TipoMovimientoCaja.EGRESO && !categoriaEgreso) {
        R.badRequest(res, 'Debe seleccionar una categoría para el egreso'); return;
      }
      const data = await cajaService.registrarMovimiento(id, {
        tipo,
        monto: parseFloat(monto),
        concepto,
        fecha,
        referencia,
        categoriaEgreso: tipo === TipoMovimientoCaja.EGRESO ? categoriaEgreso : undefined,
        vehiculoId: vehiculoId ? parseInt(vehiculoId) : undefined,
      }, req.usuario!.id);
      R.created(res, data, 'Movimiento registrado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (
        msg.includes('cerrada') || msg.includes('No puede') || msg.includes('mayor a') ||
        msg.includes('categoría') || msg.includes('no encontrado')
      ) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async getMovimientos(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      const { desde, hasta, tipo } = req.query as Record<string, string>;
      const data = await cajaService.getMovimientos(id, { desde, hasta, tipo });
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('inválida') || msg.includes('inválido')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async getMovimientosGlobal(req: Request, res: Response): Promise<void> {
    try {
      const { desde, hasta, tipo, cajaId, page, limit } = req.query as Record<string, string>;
      const data = await cajaService.getMovimientosGlobal({ desde, hasta, tipo, cajaId, page, limit });
      R.ok(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('inválida') || msg.includes('inválido')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async editarMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const movimientoId = parseInt(req.params.movimientoId);
      if (isNaN(movimientoId)) { R.badRequest(res, 'ID inválido'); return; }
      const { monto, concepto, fecha, referencia, categoriaEgreso, vehiculoId } = req.body;
      const dto: any = {};
      if (monto !== undefined)          dto.monto           = parseFloat(monto);
      if (concepto !== undefined)       dto.concepto        = concepto;
      if (fecha !== undefined)          dto.fecha           = fecha;
      if (referencia !== undefined)     dto.referencia      = referencia;
      if (categoriaEgreso !== undefined) dto.categoriaEgreso = categoriaEgreso;
      if (vehiculoId !== undefined)     dto.vehiculoId      = vehiculoId ? parseInt(vehiculoId) : null;
      const data = await cajaService.editarMovimiento(movimientoId, dto, req.usuario!.id);
      R.ok(res, data, 'Movimiento actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else if (msg.includes('No se puede') || msg.includes('No puede') || msg.includes('mayor a') || msg.includes('solo aplica')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anularMovimiento(req: Request, res: Response): Promise<void> {
    try {
      const movimientoId = parseInt(req.params.movimientoId);
      if (isNaN(movimientoId)) { R.badRequest(res, 'ID inválido'); return; }
      const data = await cajaService.anularMovimiento(movimientoId, req.usuario!.id);
      R.ok(res, data, 'Movimiento anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado')) R.notFound(res, msg);
      else if (msg.includes('ya está') || msg.includes('No se pueden') || msg.includes('No puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await cajaService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Caja eliminada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Caja no encontrada') R.notFound(res, msg);
      else if (msg.includes('Solo') || msg.includes('abierta')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const cajaController = new CajaController();
