// FILE: src/modules/guias/guias-chofer.routes.ts
// Formulario reducido de Guías para el rol CHOFER (creación desde el celular).
// No usa adminOSecretario: solo exige el módulo 'guias_chofer', que es el
// único módulo habilitado por defecto para ese rol (ver permisos.service.ts).

import { Router } from 'express';
import { guiasController } from './guias.controller';
import { verificarToken } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';

const router = Router();

router.use(verificarToken, verificarModulo('guias_chofer'));

router.get('/mias',              (req, res) => guiasController.misGuias(req, res));
router.get('/vehiculos-activos', (req, res) => guiasController.vehiculosActivos(req, res));
router.post('/',                 (req, res) => guiasController.crearReducida(req, res));
router.get('/:id/pdf',           (req, res) => guiasController.pdfPropio(req, res));

export default router;
