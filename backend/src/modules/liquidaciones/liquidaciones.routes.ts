// FILE: src/modules/liquidaciones/liquidaciones.routes.ts
// CAMBIOS v2 (P3):
//   GET  /cajas-abiertas              → cajas disponibles para pagar
//   POST /:id/pagar                   → pago total desde caja
//   POST /:id/reintegro               → conductor devuelve dinero a caja
//   POST /:id/devolucion              → empresa paga deuda al conductor desde caja
//   GET  /:id/historial-financiero    → movimientos financieros de la liquidación

import { Router } from 'express';
import { liquidacionesController } from './liquidaciones.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

// ── Rutas estáticas (ANTES de las dinámicas) ──────────────────────────────────
router.get('/pedidos-disponibles', liquidacionesController.pedidosDisponibles.bind(liquidacionesController));
router.get('/cajas-abiertas',      liquidacionesController.cajasAbiertas.bind(liquidacionesController));

router.get('/',    liquidacionesController.listar.bind(liquidacionesController));
router.post('/',   liquidacionesController.crear.bind(liquidacionesController));

// ── Rutas dinámicas ───────────────────────────────────────────────────────────
router.get('/:id',                         liquidacionesController.obtener.bind(liquidacionesController));
router.put('/:id',                         liquidacionesController.actualizar.bind(liquidacionesController));
router.delete('/:id',                      liquidacionesController.eliminar.bind(liquidacionesController));

// P3: pago y movimientos financieros
router.post('/:id/pagar',                  liquidacionesController.pagar.bind(liquidacionesController));
router.post('/:id/reintegro',              liquidacionesController.reintegro.bind(liquidacionesController));
router.post('/:id/devolucion',             liquidacionesController.devolucion.bind(liquidacionesController));
router.get('/:id/historial-financiero',    liquidacionesController.historialFinanciero.bind(liquidacionesController));

export default router;
