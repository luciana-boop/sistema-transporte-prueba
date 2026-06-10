// FILE: src/modules/cobranza/cobranza.routes.ts
// NUEVO: PUT /:id (editar), PATCH /:id/anular (anulación lógica)

import { Router } from 'express';
import { body } from 'express-validator';
import { cobranzaController } from './cobranza.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo, verificarAccion } from '../../middleware/permisos.middleware';
import { validate } from '../../middleware/validation.middleware';
import { MetodoPago } from '../../utils/enums';

const router = Router();
router.use(verificarToken, adminOSecretario, verificarModulo('cobranza'));

const registrarPagoValidations = [
  body('facturaId').isInt({ gt: 0 }).withMessage('facturaId inválido'),
  body('monto').isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),
  body('metodoPago').isIn(Object.values(MetodoPago)).withMessage('metodoPago inválido'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
  body('fechaPago').optional({ values: 'falsy' }).isISO8601().withMessage('fechaPago inválida'),
  body('cuentaId').isInt({ gt: 0 }).withMessage('cuentaId inválido'),
  body('monedaId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('monedaId inválido'),
  body('tipoPagoId').optional({ values: 'falsy' }).isInt({ gt: 0 }).withMessage('tipoPagoId inválido'),
];

const actualizarValidations = [
  body('metodoPago').optional().isIn(Object.values(MetodoPago)).withMessage('metodoPago inválido'),
  body('referencia').optional({ values: 'falsy' }).isString().isLength({ max: 255 }).withMessage('referencia inválida'),
  body('observaciones').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('observaciones inválidas'),
  body('fechaPago').optional({ values: 'falsy' }).isISO8601().withMessage('fechaPago inválida'),
];

const anularValidations = [
  body('motivo').optional({ values: 'falsy' }).isString().isLength({ max: 500 }).withMessage('motivo inválido'),
];

router.get('/',                                  cobranzaController.listar.bind(cobranzaController));
router.get('/cuentas-por-cobrar',                cobranzaController.cuentasPorCobrar.bind(cobranzaController));
// P8: detalle uniforme de una cuenta por cobrar (debe ir antes de /:id)
router.get('/cuentas-por-cobrar/:facturaId/detalle', cobranzaController.detalleCuentaPorCobrar.bind(cobranzaController));
router.get('/facturas-cliente/:clienteId',       cobranzaController.facturasPorCliente.bind(cobranzaController));
router.get('/:id',                               cobranzaController.obtener.bind(cobranzaController));
router.post('/',                                 validate(registrarPagoValidations), cobranzaController.registrarPago.bind(cobranzaController));
router.put('/:id',                               validate(actualizarValidations), cobranzaController.actualizar.bind(cobranzaController));
router.patch('/:id/anular',                      verificarAccion('anular_cobranza'), validate(anularValidations), cobranzaController.anular.bind(cobranzaController));
router.delete('/:id',                            cobranzaController.eliminar.bind(cobranzaController));

export default router;
