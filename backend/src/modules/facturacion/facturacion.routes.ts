// FILE: src/modules/facturacion/facturacion.routes.ts
// CAMBIOS v2 (P1):
//   - GET /:id/pdf      → sirve/streama el PDF (inline o descarga con ?download=1)
//   - GET /:id/pdf-info → devuelve metadata del PDF sin hacer streaming

import { Router } from 'express';
import { facturacionController } from './facturacion.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/',                           facturacionController.listar.bind(facturacionController));
router.get('/series',                     facturacionController.series.bind(facturacionController));
router.get('/correlativo/:serie',         facturacionController.proximoCorrelativo.bind(facturacionController));

// P1: rutas de PDF — deben ir ANTES de /:id para evitar conflictos de parámetros
router.get('/:id/pdf',                    facturacionController.servirPdf.bind(facturacionController));
router.get('/:id/pdf-info',               facturacionController.infoPdf.bind(facturacionController));

router.get('/:id',                        facturacionController.obtener.bind(facturacionController));
router.post('/',                          facturacionController.crear.bind(facturacionController));
router.post('/desde-xml',                 facturacionController.crearDesdeXml.bind(facturacionController));
router.post('/importacion-masiva-xml',    facturacionController.importacionMasivaXml.bind(facturacionController));
router.put('/:id',                        facturacionController.actualizar.bind(facturacionController));
router.patch('/:id/anular',              facturacionController.anular.bind(facturacionController));
router.delete('/:id',                     facturacionController.eliminar.bind(facturacionController));

export default router;
