// FILE: src/modules/reportes/reportes.routes.ts

import { Router } from 'express';
import { reportesController } from './reportes.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('reportes'));

// GET /api/reportes/dashboard
router.get('/dashboard', reportesController.dashboard.bind(reportesController));

// GET /api/reportes/anual?anio=2026
router.get('/anual', reportesController.anual.bind(reportesController));

// GET /api/reportes/conductor-del-mes
router.get('/conductor-del-mes', reportesController.conductorDelMes.bind(reportesController));

// GET /api/reportes/tabla-semanal?desde=2026-06-01&hasta=2026-06-07
router.get('/tabla-semanal', reportesController.tablaSemanal.bind(reportesController));

// GET /api/reportes/pedidos?desde=2024-01-01&hasta=2024-12-31&clienteId=1
router.get('/pedidos', reportesController.pedidos.bind(reportesController));

// GET /api/reportes/facturacion?desde=2024-01-01&hasta=2024-12-31
router.get('/facturacion', reportesController.facturacion.bind(reportesController));

// GET /api/reportes/cobranza?desde=2024-01-01&hasta=2024-12-31
router.get('/cobranza', reportesController.cobranza.bind(reportesController));

// GET /api/reportes/caja?desde=2024-01-01&hasta=2024-12-31
router.get('/caja', reportesController.caja.bind(reportesController));

// GET /api/reportes/egresos?desde=2024-01-01&hasta=2024-12-31
router.get('/egresos', reportesController.egresos.bind(reportesController));

// GET /api/reportes/mantenimiento?desde=2024-01-01&hasta=2024-12-31&vehiculoId=1
router.get('/mantenimiento', reportesController.mantenimiento.bind(reportesController));

// GET /api/reportes/rentabilidad-cliente?desde=2024-01-01&hasta=2024-12-31
router.get('/rentabilidad-cliente', reportesController.rentabilidadPorCliente.bind(reportesController));

// GET /api/reportes/rentabilidad-cliente/:clienteId/detalle?desde=...&hasta=...
router.get('/rentabilidad-cliente/:clienteId/detalle', reportesController.rentabilidadClienteDetalle.bind(reportesController));

// GET /api/reportes/tabla-semanal/:conductorId/detalle?desde=...&hasta=...
router.get('/tabla-semanal/:conductorId/detalle', reportesController.detalleConductorSemanal.bind(reportesController));

export default router;
