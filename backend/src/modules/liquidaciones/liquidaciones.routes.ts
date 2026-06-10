// FILE: src/modules/liquidaciones/liquidaciones.routes.ts
// Flujo v4: CREADA → PAGADA → RENDIDA → CERRADA
//   POST /:id/pagar   → paso 2: registrar pago (CREADA→PAGADA)
//   POST /:id/rendir  → paso 3: registrar gastos (PAGADA→RENDIDA)
//   POST /:id/cerrar  → paso 4: registrar ajuste final (RENDIDA→CERRADA)

import { Router } from 'express';
import { body } from 'express-validator';
import { liquidacionesController } from './liquidaciones.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';
import { CategoriaDetalle } from '../../utils/enums';

const router = Router();
router.use(verificarToken, adminOSecretario, verificarModulo('liquidaciones'));

const crearValidations = [
  body('conductorId').isInt({ gt: 0 }).withMessage('conductorId inválido'),
  body('placaTracto').isString().trim().isLength({ min: 1, max: 20 }).withMessage('placaTracto inválida'),
  body('montoEntregado').isFloat({ gt: 0 }).withMessage('montoEntregado debe ser un número mayor a 0'),
  body('fecha').isISO8601().withMessage('fecha inválida'),
  body('toldo').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('toldo debe ser un número mayor o igual a 0'),
  body('pedidoIds').optional().isArray().withMessage('pedidoIds debe ser un array'),
];

const actualizarValidations = [
  body('placaTracto').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('placaTracto inválida'),
  body('montoEntregado').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('montoEntregado debe ser un número mayor a 0'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('toldo').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('toldo debe ser un número mayor o igual a 0'),
  body('pedidoIds').optional().isArray().withMessage('pedidoIds debe ser un array'),
];

const pagarValidations = [
  body('cajaId').isInt({ gt: 0 }).withMessage('cajaId inválido'),
  body('montoPagado').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('montoPagado debe ser un número mayor a 0'),
  body('fechaPago').optional({ values: 'falsy' }).isISO8601().withMessage('fechaPago inválida'),
];

const rendirValidations = [
  body('detalles').isArray({ min: 1 }).withMessage('detalles es requerido y debe contener al menos un elemento'),
  body('detalles.*.categoria').isIn(Object.values(CategoriaDetalle)).withMessage('categoria inválida'),
  body('detalles.*.descripcion').isString().trim().isLength({ min: 1, max: 500 }).withMessage('descripcion debe tener entre 1 y 500 caracteres'),
  body('detalles.*.monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
];

const cerrarValidations = [
  body('cajaId').isInt({ gt: 0 }).withMessage('cajaId inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
];

// Rutas estáticas (antes de las dinámicas)
router.get('/pedidos-disponibles', liquidacionesController.pedidosDisponibles.bind(liquidacionesController));
router.get('/cajas-abiertas',      liquidacionesController.cajasAbiertas.bind(liquidacionesController));

router.get('/',  liquidacionesController.listar.bind(liquidacionesController));
router.post('/', validate(crearValidations), liquidacionesController.crear.bind(liquidacionesController));

// Rutas dinámicas
router.get('/:id',    liquidacionesController.obtener.bind(liquidacionesController));
router.put('/:id',    validate(actualizarValidations), liquidacionesController.actualizar.bind(liquidacionesController));
router.delete('/:id', liquidacionesController.eliminar.bind(liquidacionesController));

// Flujo de estados
router.post('/:id/pagar',              validate(pagarValidations), liquidacionesController.pagar.bind(liquidacionesController));
router.post('/:id/rendir',             validate(rendirValidations), liquidacionesController.rendir.bind(liquidacionesController));
router.post('/:id/cerrar',             validate(cerrarValidations), liquidacionesController.cerrar.bind(liquidacionesController));
router.get('/:id/historial-financiero', liquidacionesController.historialFinanciero.bind(liquidacionesController));

export default router;
