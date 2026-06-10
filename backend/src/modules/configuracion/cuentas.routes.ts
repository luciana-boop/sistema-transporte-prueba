// FILE: src/modules/configuracion/cuentas.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { cuentasController } from './cuentas.controller';
import { verificarToken, soloAdmin, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo, verificarAccion } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';

const router = Router();
router.use(verificarToken, verificarModulo('configuracion'));

const crearCuentaValidations = [
  body('nombre').isString().trim().isLength({ min: 1, max: 255 }).withMessage('nombre debe tener entre 1 y 255 caracteres'),
  body('tipoCuenta').isString().trim().isLength({ min: 1, max: 100 }).withMessage('tipoCuenta inválido'),
  body('monedaId').isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('saldoInicial').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('saldoInicial debe ser un número mayor o igual a 0'),
  body('descripcion').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('descripcion inválida'),
  body('banco').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('banco inválido'),
  body('numeroCuenta').optional({ values: 'falsy' }).isString().isLength({ max: 100 }).withMessage('numeroCuenta inválido'),
];

const actualizarCuentaValidations = [
  body('nombre').optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage('nombre debe tener entre 1 y 255 caracteres'),
  body('tipoCuenta').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('tipoCuenta inválido'),
  body('monedaId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('descripcion').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('descripcion inválida'),
  body('banco').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('banco inválido'),
  body('numeroCuenta').optional({ values: 'falsy' }).isString().isLength({ max: 100 }).withMessage('numeroCuenta inválido'),
];

const registrarMovimientoValidations = [
  body('cuentaId').isInt({ gt: 0 }).withMessage('cuentaId inválido'),
  body('tipo').isIn(['INGRESO', 'EGRESO']).withMessage('tipo debe ser INGRESO o EGRESO'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('monedaId').isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('tipoPagoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('tipoPagoId inválido'),
  body('concepto').isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
];

const actualizarMovimientoValidations = [
  body('concepto').optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('tipoPagoId').optional({ nullable: true }).isInt({ gt: 0 }).withMessage('tipoPagoId inválido'),
];

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
router.post('/cuentas',          soloAdmin, validate(crearCuentaValidations),     cuentasController.createCuenta.bind(cuentasController));
router.put('/cuentas/:id',       soloAdmin, validate(actualizarCuentaValidations), cuentasController.updateCuenta.bind(cuentasController));
router.delete('/cuentas/:id',    soloAdmin,        cuentasController.deleteCuenta.bind(cuentasController));

// Movimientos
router.get('/movimientos',              adminOSecretario, cuentasController.getMovimientos.bind(cuentasController));
router.post('/movimientos',             adminOSecretario, validate(registrarMovimientoValidations), cuentasController.registrarMovimiento.bind(cuentasController));
// P7: detalle / edición controlada / anulación con reversión de saldo
router.get('/movimientos/:id',           adminOSecretario, cuentasController.obtenerMovimiento.bind(cuentasController));
router.put('/movimientos/:id',           adminOSecretario, validate(actualizarMovimientoValidations), cuentasController.actualizarMovimiento.bind(cuentasController));
router.patch('/movimientos/:id/anular',  adminOSecretario, verificarAccion('anular_movimiento_cuenta'), cuentasController.anularMovimiento.bind(cuentasController));

// Resumen financiero
router.get('/resumen',           adminOSecretario, cuentasController.getResumenFinanciero.bind(cuentasController));

export default router;
