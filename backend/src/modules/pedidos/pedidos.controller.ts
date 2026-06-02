// FILE: src/modules/pedidos/pedidos.controller.ts
// MODIFICADO: sin peso, solo ACTIVO/ANULADO

import { Request, Response } from 'express';
import { pedidosService } from './pedidos.service';
import * as R from '../../utils/response';

export class PedidosController {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { estado, clienteId, desde, hasta, search } = req.query as Record<string, string>;
      R.ok(res, await pedidosService.findAll({ estado, clienteId, desde, hasta, search }));
    } catch (e) { R.serverError(res, e); }
  }

  async obtener(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await pedidosService.findById(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pedido no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }

  async crear(req: Request, res: Response): Promise<void> {
    try {
      const { clienteId, origen, destino, tipoCarga, tarifa, observaciones } = req.body;
      if (!clienteId || !origen || !destino || !tipoCarga || !tarifa) {
        R.badRequest(res, 'clienteId, origen, destino, tipoCarga y tarifa son requeridos'); return;
      }
      R.created(res,
        await pedidosService.create(
          { clienteId: parseInt(clienteId), origen, destino, tipoCarga, tarifa: parseFloat(tarifa), observaciones },
          req.usuario!.id
        ),
        'Pedido creado'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no encontrado') || msg.includes('desactivado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async actualizar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await pedidosService.update(id, req.body), 'Pedido actualizado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pedido no encontrado') R.notFound(res, msg);
      else if (msg.includes('No se puede')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async anular(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await pedidosService.anular(id, req.usuario!.rol), 'Pedido anulado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pedido no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo') || msg.includes('ya está')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async eliminar(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      await pedidosService.remove(id, req.usuario!.rol);
      R.ok(res, null, 'Pedido eliminado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pedido no encontrado') R.notFound(res, msg);
      else if (msg.includes('Solo')) R.forbidden(res, msg);
      else R.serverError(res, e);
    }
  }

  async rentabilidad(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { R.badRequest(res, 'ID inválido'); return; }
      R.ok(res, await pedidosService.rentabilidad(id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Pedido no encontrado') R.notFound(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const pedidosController = new PedidosController();
