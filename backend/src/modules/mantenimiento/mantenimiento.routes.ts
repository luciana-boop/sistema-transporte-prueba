// FILE: src/modules/mantenimiento/mantenimiento.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { mantenimientoController } from './mantenimiento.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('mantenimiento'));

const relacionarValidations = [
  body('vehiculoId').isInt({ gt: 0 }).withMessage('vehiculoId inválido'),
  body('conductorId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('conductorId inválido'),
  body('motivoCodigo').isString().trim().isLength({ min: 1 }).withMessage('motivoCodigo es requerido'),
  body('descripcion').optional({ values: 'falsy' }).isString().isLength({ max: 500 }).withMessage('descripción inválida'),
];

router.get('/', mantenimientoController.listar.bind(mantenimientoController));
router.post('/:movimientoId/relacionar', validate(relacionarValidations), mantenimientoController.relacionar.bind(mantenimientoController));

export default router;
