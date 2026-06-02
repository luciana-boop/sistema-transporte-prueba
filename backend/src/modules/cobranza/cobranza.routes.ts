// FILE: src/modules/cobranza/cobranza.routes.ts
import { Router } from 'express';
import { cobranzaController } from './cobranza.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/',                                  cobranzaController.listar.bind(cobranzaController));
router.get('/cuentas-por-cobrar',                cobranzaController.cuentasPorCobrar.bind(cobranzaController));
router.get('/facturas-cliente/:clienteId',       cobranzaController.facturasPorCliente.bind(cobranzaController));
router.get('/:id',                               cobranzaController.obtener.bind(cobranzaController));
router.post('/',                                 cobranzaController.registrarPago.bind(cobranzaController));
router.delete('/:id',                            cobranzaController.eliminar.bind(cobranzaController));

export default router;
