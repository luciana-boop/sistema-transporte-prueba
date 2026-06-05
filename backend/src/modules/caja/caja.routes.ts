// FILE: src/modules/caja/caja.routes.ts

import { Router } from 'express';
import { cajaController } from './caja.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario);

router.get('/', cajaController.listar.bind(cajaController));
router.get('/actual', cajaController.cajaActual.bind(cajaController));
// NUEVO: movimientos globales (debe ir ANTES de /:id para no colisionar)
router.get('/movimientos', cajaController.getMovimientosGlobal.bind(cajaController));
router.get('/:id', cajaController.obtener.bind(cajaController));
// NUEVO: movimientos de una caja específica
router.get('/:id/movimientos', cajaController.getMovimientos.bind(cajaController));
router.post('/abrir', cajaController.abrir.bind(cajaController));
router.patch('/:id/cerrar', cajaController.cerrar.bind(cajaController));
router.post('/:id/movimiento', cajaController.registrarMovimiento.bind(cajaController));
// MEJORA 2: editar y anular movimientos manuales
// Estas rutas van ANTES de /:id para no colisionar
router.put('/movimientos/:movimientoId', cajaController.editarMovimiento.bind(cajaController));
router.patch('/movimientos/:movimientoId/anular', cajaController.anularMovimiento.bind(cajaController));
router.delete('/:id', cajaController.eliminar.bind(cajaController));

export default router;
