// FILE: src/modules/movimientos/movimientos.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { movimientosController } from './movimientos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo, verificarAccion } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('movimientos'));

const crearValidations = [
  body('cuentaId').isInt({ gt: 0 }).withMessage('cuentaId inválido'),
  body('tipo').isIn(['INGRESO', 'EGRESO']).withMessage('tipo debe ser INGRESO o EGRESO'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('monedaId').isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('tipoPagoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('tipoPagoId inválido'),
  body('concepto').isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('N° de operación inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('notaEgreso').optional({ values: 'falsy' }).isString().isLength({ max: 500 }).withMessage('referencia inválida'),
  body('categoriaEgreso').optional({ values: 'falsy' }).isIn(['COMBUSTIBLE', 'MANTENIMIENTO', 'CAJA_CHICA', 'PLANILLA', 'OTROS']).withMessage('categoriaEgreso inválida'),
  body('categoriaIngreso').optional({ values: 'falsy' }).isIn(['PAGO_FACTURA', 'CAJA_CHICA', 'LIQUIDACION', 'OTRO']).withMessage('categoriaIngreso inválida'),
  body('notaIngreso').optional({ values: 'falsy' }).isString().isLength({ max: 500 }).withMessage('observación inválida'),
  body('clienteId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('clienteId inválido'),
];

const actualizarValidations = [
  body('concepto').optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('N° de operación inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('notaEgreso').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('referencia inválida'),
  body('categoriaEgreso').optional({ nullable: true }).isIn(['COMBUSTIBLE', 'MANTENIMIENTO', 'CAJA_CHICA', 'PLANILLA', 'OTROS']).withMessage('categoriaEgreso inválida'),
];

const importarValidations = [
  body('cuentaId').isInt({ gt: 0 }).withMessage('cuentaId inválido'),
  body('monedaId').isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('filas').isArray({ min: 1 }).withMessage('filas debe ser un arreglo no vacío'),
  body('confirmarDuplicados').optional().isBoolean().withMessage('confirmarDuplicados inválido'),
];

router.get('/', movimientosController.listar.bind(movimientosController));
router.get('/resumen', movimientosController.resumen.bind(movimientosController));
router.get('/:id', movimientosController.obtener.bind(movimientosController));
router.post('/', validate(crearValidations), movimientosController.crear.bind(movimientosController));
router.post('/importar', validate(importarValidations), movimientosController.importar.bind(movimientosController));
router.put('/:id', validate(actualizarValidations), movimientosController.actualizar.bind(movimientosController));
router.patch('/:id/anular', verificarAccion('anular_movimiento'), movimientosController.anular.bind(movimientosController));

export default router;
