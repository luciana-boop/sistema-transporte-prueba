// FILE: src/modules/liquidaciones/liquidaciones.routes.ts
// Flujo v4: CREADA → PAGADA → RENDIDA → CERRADA
//   POST /:id/pagar   → paso 2: registrar pago (CREADA→PAGADA)
//   POST /:id/rendir  → paso 3: registrar gastos (PAGADA→RENDIDA)
//   POST /:id/cerrar  → paso 4: registrar ajuste final (RENDIDA→CERRADA)

import { Router } from 'express';
import { liquidacionesController } from './liquidaciones.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

// Rutas estáticas (antes de las dinámicas)
router.get('/pedidos-disponibles', liquidacionesController.pedidosDisponibles.bind(liquidacionesController));
router.get('/cajas-abiertas',      liquidacionesController.cajasAbiertas.bind(liquidacionesController));

router.get('/',  liquidacionesController.listar.bind(liquidacionesController));
router.post('/', liquidacionesController.crear.bind(liquidacionesController));

// Rutas dinámicas
router.get('/:id',    liquidacionesController.obtener.bind(liquidacionesController));
router.put('/:id',    liquidacionesController.actualizar.bind(liquidacionesController));
router.delete('/:id', liquidacionesController.eliminar.bind(liquidacionesController));

// Flujo de estados
router.post('/:id/pagar',              liquidacionesController.pagar.bind(liquidacionesController));
router.post('/:id/rendir',             liquidacionesController.rendir.bind(liquidacionesController));
router.post('/:id/cerrar',             liquidacionesController.cerrar.bind(liquidacionesController));
router.get('/:id/historial-financiero', liquidacionesController.historialFinanciero.bind(liquidacionesController));

export default router;
