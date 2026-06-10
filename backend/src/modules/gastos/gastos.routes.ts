// FILE: src/modules/gastos/gastos.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { gastosController } from './gastos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';
import { TipoGasto } from '../../utils/enums';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('gastos'));

const crearValidations = [
  body('tipoGasto').isIn(Object.values(TipoGasto)).withMessage('tipoGasto inválido'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('descripcion').isString().trim().isLength({ min: 1, max: 500 }).withMessage('descripcion debe tener entre 1 y 500 caracteres'),
  body('comprobante').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('comprobante inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('vehiculoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('vehiculoId inválido'),
  body('cuentaId').isInt({ gt: 0 }).withMessage('cuentaId inválido'),
  body('monedaId').isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('tipoPagoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('tipoPagoId inválido'),
];

const actualizarValidations = [
  body('tipoGasto').optional().isIn(Object.values(TipoGasto)).withMessage('tipoGasto inválido'),
  body('descripcion').optional().isString().trim().isLength({ min: 1, max: 500 }).withMessage('descripcion debe tener entre 1 y 500 caracteres'),
  body('comprobante').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('comprobante inválido'),
  body('fecha').optional({ values: 'falsy' }).isISO8601().withMessage('fecha inválida'),
  body('vehiculoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('vehiculoId inválido'),
];

router.get('/', gastosController.listar.bind(gastosController));
router.get('/resumen', gastosController.resumen.bind(gastosController));
router.get('/:id', gastosController.obtener.bind(gastosController));
router.post('/', validate(crearValidations), gastosController.crear.bind(gastosController));
router.put('/:id', validate(actualizarValidations), gastosController.actualizar.bind(gastosController));
router.delete('/:id', gastosController.eliminar.bind(gastosController));

export default router;
