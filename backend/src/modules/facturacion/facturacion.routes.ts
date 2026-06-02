// FILE: src/modules/facturacion/facturacion.routes.ts
import { Router } from 'express';
import { facturacionController } from './facturacion.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/',                           facturacionController.listar.bind(facturacionController));
router.get('/series',                     facturacionController.series.bind(facturacionController));
router.get('/correlativo/:serie',         facturacionController.proximoCorrelativo.bind(facturacionController));
router.get('/:id',                        facturacionController.obtener.bind(facturacionController));
router.post('/',                          facturacionController.crear.bind(facturacionController));
router.post('/desde-xml',                 facturacionController.crearDesdeXml.bind(facturacionController));
router.post('/importacion-masiva-xml',    facturacionController.importacionMasivaXml.bind(facturacionController));
router.put('/:id',                        facturacionController.actualizar.bind(facturacionController));
router.patch('/:id/anular',              facturacionController.anular.bind(facturacionController));
router.delete('/:id',                     facturacionController.eliminar.bind(facturacionController));

export default router;
