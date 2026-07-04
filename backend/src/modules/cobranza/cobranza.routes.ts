// FILE: src/modules/cobranza/cobranza.routes.ts

import { Router } from 'express';
import { body } from 'express-validator';
import { cobranzaController } from './cobranza.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('cobranza'));

const aplicarValidations = [
  body('aplicaciones').isArray({ min: 1 }).withMessage('aplicaciones debe ser un arreglo no vacío'),
  body('aplicaciones.*.facturaId').isInt({ gt: 0 }).withMessage('facturaId inválido'),
  body('aplicaciones.*.monto').isFloat({ gt: 0 }).withMessage('monto debe ser mayor a 0'),
];

router.get('/', cobranzaController.listar.bind(cobranzaController));
router.get('/:clienteId/facturas-pendientes', cobranzaController.facturasPendientes.bind(cobranzaController));
router.post('/:pagoId/aplicar', validate(aplicarValidations), cobranzaController.aplicar.bind(cobranzaController));
router.delete('/aplicaciones/:id', cobranzaController.quitarAplicacion.bind(cobranzaController));

export default router;
