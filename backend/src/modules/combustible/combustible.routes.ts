// FILE: src/modules/combustible/combustible.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { combustibleController } from './combustible.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario, verificarModulo('combustible'));

const crearValidations = [
  body('vehiculoId').isInt({ gt: 0 }).withMessage('vehiculoId inválido'),
  body('fecha').isISO8601().withMessage('fecha inválida'),
  body('galones').isFloat({ gt: 0 }).withMessage('galones debe ser un número mayor a 0'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('conductorId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('conductorId inválido'),
  body('liquidacionId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('liquidacionId inválido'),
  body('kilometraje').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('kilometraje debe ser un número mayor o igual a 0'),
  body('grifo').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('grifo inválido'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
  body('movimientoCuentaId').isInt({ gt: 0 }).withMessage('movimientoCuentaId inválido'),
];

const actualizarValidations = [
  body('vehiculoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('vehiculoId inválido'),
  body('conductorId').optional({ nullable: true }).isInt({ gt: 0 }).withMessage('conductorId inválido'),
  body('liquidacionId').optional({ nullable: true }).isInt({ gt: 0 }).withMessage('liquidacionId inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('galones').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('galones debe ser un número mayor a 0'),
  body('monto').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('kilometraje').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('kilometraje debe ser un número mayor o igual a 0'),
  body('grifo').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('grifo inválido'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
];

router.get('/', combustibleController.listar.bind(combustibleController));
router.get('/resumen', combustibleController.resumen.bind(combustibleController));
router.get('/egresos-disponibles', combustibleController.egresosDisponibles.bind(combustibleController));
router.get('/:id', combustibleController.obtener.bind(combustibleController));
router.post('/', validate(crearValidations), combustibleController.crear.bind(combustibleController));
router.put('/:id', validate(actualizarValidations), combustibleController.actualizar.bind(combustibleController));
router.delete('/:id', combustibleController.eliminar.bind(combustibleController));

export default router;
