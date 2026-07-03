// FILE: src/modules/guias/guias.routes.ts

import { Router } from 'express';
import { guiasController } from './guias.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo, verificarAccion } from '../../middleware/permisos.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario, verificarModulo('guias'));

router.get('/',                              (req, res) => guiasController.listar(req, res));
router.post('/',                             (req, res) => guiasController.crear(req, res));
router.get('/pendientes-sunat',              (req, res) => guiasController.pendientesSunat(req, res));
router.post('/enviar-sunat/lote',            (req, res) => guiasController.enviarSunatLote(req, res));
router.get('/:id',                           (req, res) => guiasController.obtener(req, res));
router.get('/:id/pdf',                       (req, res) => guiasController.generarPdf(req, res));
router.post('/:id/anular',                   verificarAccion('anular_guia'), (req, res) => guiasController.anular(req, res));
router.post('/:id/enviar-sunat',             (req, res) => guiasController.enviarSunat(req, res));
router.patch('/:id/factura',                 (req, res) => guiasController.vincularFactura(req, res));

export default router;
