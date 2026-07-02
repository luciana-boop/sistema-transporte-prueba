// FILE: src/modules/caja/caja.routes.ts
// IMPORTANTE: Las rutas estáticas van siempre ANTES de las dinámicas (/:id).

import { Router } from 'express';
import { body } from 'express-validator';
import { cajaController } from './caja.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo, verificarAccion } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';
import { TipoMovimientoCaja } from '../../utils/enums';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('caja'));

const abrirValidations = [
  body('movimientoCuentaId').isInt({ gt: 0 }).withMessage('movimientoCuentaId inválido'),
  body('nombre').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('nombre inválido'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
];

const cerrarValidations = [
  body('saldoCierre').isFloat({ min: 0 }).withMessage('saldoCierre debe ser un número mayor o igual a 0'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
  body('cuentaDestinoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('cuentaDestinoId inválido'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('N° de operación inválido'),
];

const registrarMovimientoValidations = [
  body('tipo').isIn(Object.values(TipoMovimientoCaja)).withMessage('tipo inválido'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('concepto').isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
];

const editarMovimientoValidations = [
  body('monto').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('concepto').optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage('concepto debe tener entre 1 y 255 caracteres'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
];

// ── Rutas estáticas (deben ir ANTES de /:id) ─────────────────────────────────
router.get('/', cajaController.listar.bind(cajaController));
router.get('/actual', cajaController.cajaActual.bind(cajaController));
router.get('/movimientos', cajaController.getMovimientosGlobal.bind(cajaController));
router.get('/egresos-disponibles', cajaController.egresosDisponibles.bind(cajaController));

// Editar / anular movimientos manuales
router.put('/movimientos/:movimientoId', validate(editarMovimientoValidations), cajaController.editarMovimiento.bind(cajaController));
router.patch('/movimientos/:movimientoId/anular', verificarAccion('anular_movimiento_caja'), cajaController.anularMovimiento.bind(cajaController));

// ── Rutas dinámicas (/:id al final para no capturar estáticas) ───────────────
router.get('/:id', cajaController.obtener.bind(cajaController));
router.get('/:id/movimientos', cajaController.getMovimientos.bind(cajaController));
router.post('/abrir', validate(abrirValidations), cajaController.abrir.bind(cajaController));
router.patch('/:id/cerrar', validate(cerrarValidations), cajaController.cerrar.bind(cajaController));
router.post('/:id/movimiento', validate(registrarMovimientoValidations), cajaController.registrarMovimiento.bind(cajaController));
router.delete('/:id', cajaController.eliminar.bind(cajaController));

export default router;
