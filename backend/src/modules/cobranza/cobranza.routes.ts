// FILE: src/modules/cobranza/cobranza.routes.ts
// NUEVO: PUT /:id (editar), PATCH /:id/anular (anulación lógica)

import { Router } from 'express';
import { cobranzaController } from './cobranza.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/',                                  cobranzaController.listar.bind(cobranzaController));
router.get('/cuentas-por-cobrar',                cobranzaController.cuentasPorCobrar.bind(cobranzaController));
// P8: detalle uniforme de una cuenta por cobrar (debe ir antes de /:id)
router.get('/cuentas-por-cobrar/:facturaId/detalle', cobranzaController.detalleCuentaPorCobrar.bind(cobranzaController));
router.get('/facturas-cliente/:clienteId',       cobranzaController.facturasPorCliente.bind(cobranzaController));
router.get('/:id',                               cobranzaController.obtener.bind(cobranzaController));
router.post('/',                                 cobranzaController.registrarPago.bind(cobranzaController));
router.put('/:id',                               cobranzaController.actualizar.bind(cobranzaController));
router.patch('/:id/anular',                      cobranzaController.anular.bind(cobranzaController));
router.delete('/:id',                            cobranzaController.eliminar.bind(cobranzaController));

export default router;
