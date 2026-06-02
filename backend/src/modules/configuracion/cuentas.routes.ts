// FILE: src/modules/configuracion/cuentas.routes.ts

import { Router } from 'express';
import { cuentasController } from './cuentas.controller';
import { verificarToken, soloAdmin, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken);

// Init
router.post('/inicializar', soloAdmin, cuentasController.inicializar.bind(cuentasController));

// Monedas — lectura para todos, escritura solo admin
router.get('/monedas',          adminOSecretario, cuentasController.getMonedas.bind(cuentasController));
router.get('/monedas/activas',  adminOSecretario, cuentasController.getMonedasActivas.bind(cuentasController));
router.get('/monedas/default',  adminOSecretario, cuentasController.getMonedaDefault.bind(cuentasController));
router.post('/monedas',         soloAdmin,        cuentasController.createMoneda.bind(cuentasController));
router.put('/monedas/:id',      soloAdmin,        cuentasController.updateMoneda.bind(cuentasController));
router.delete('/monedas/:id',   soloAdmin,        cuentasController.deleteMoneda.bind(cuentasController));

// Tipos de pago
router.get('/tipos-pago',         adminOSecretario, cuentasController.getTiposPago.bind(cuentasController));
router.get('/tipos-pago/activos', adminOSecretario, cuentasController.getTiposPagoActivos.bind(cuentasController));
router.post('/tipos-pago',        soloAdmin,        cuentasController.createTipoPago.bind(cuentasController));
router.put('/tipos-pago/:id',     soloAdmin,        cuentasController.updateTipoPago.bind(cuentasController));
router.delete('/tipos-pago/:id',  soloAdmin,        cuentasController.deleteTipoPago.bind(cuentasController));

// Cuentas
router.get('/cuentas',           adminOSecretario, cuentasController.getCuentas.bind(cuentasController));
router.get('/cuentas/:id',       adminOSecretario, cuentasController.getCuenta.bind(cuentasController));
router.post('/cuentas',          soloAdmin,        cuentasController.createCuenta.bind(cuentasController));
router.put('/cuentas/:id',       soloAdmin,        cuentasController.updateCuenta.bind(cuentasController));
router.delete('/cuentas/:id',    soloAdmin,        cuentasController.deleteCuenta.bind(cuentasController));

// Movimientos
router.get('/movimientos',       adminOSecretario, cuentasController.getMovimientos.bind(cuentasController));
router.post('/movimientos',      adminOSecretario, cuentasController.registrarMovimiento.bind(cuentasController));

// Resumen financiero
router.get('/resumen',           adminOSecretario, cuentasController.getResumenFinanciero.bind(cuentasController));

export default router;
