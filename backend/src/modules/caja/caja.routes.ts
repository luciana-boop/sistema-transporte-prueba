// FILE: src/modules/caja/caja.routes.ts
// CHAT 9: Agrega rutas para liquidaciones pendientes.
// IMPORTANTE: Las rutas estáticas van siempre ANTES de las dinámicas (/:id).

import { Router } from 'express';
import { cajaController } from './caja.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario);

// ── Rutas estáticas (deben ir ANTES de /:id) ─────────────────────────────────
router.get('/', cajaController.listar.bind(cajaController));
router.get('/actual', cajaController.cajaActual.bind(cajaController));
router.get('/movimientos', cajaController.getMovimientosGlobal.bind(cajaController));

// CHAT 9: Liquidaciones pendientes
router.get('/liquidaciones-pendientes', cajaController.liquidacionesPendientes.bind(cajaController));
router.post('/pagar-liquidacion', cajaController.pagarLiquidacion.bind(cajaController));
router.post('/liquidaciones/:liquidacionId/anular-pago', cajaController.anularPagoLiquidacion.bind(cajaController));

// Editar / anular movimientos manuales
router.put('/movimientos/:movimientoId', cajaController.editarMovimiento.bind(cajaController));
router.patch('/movimientos/:movimientoId/anular', cajaController.anularMovimiento.bind(cajaController));

// ── Rutas dinámicas (/:id al final para no capturar estáticas) ───────────────
router.get('/:id', cajaController.obtener.bind(cajaController));
router.get('/:id/movimientos', cajaController.getMovimientos.bind(cajaController));
router.post('/abrir', cajaController.abrir.bind(cajaController));
router.patch('/:id/cerrar', cajaController.cerrar.bind(cajaController));
router.post('/:id/movimiento', cajaController.registrarMovimiento.bind(cajaController));
router.delete('/:id', cajaController.eliminar.bind(cajaController));

export default router;
