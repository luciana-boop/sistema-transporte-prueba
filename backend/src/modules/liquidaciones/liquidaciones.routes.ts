// FILE: src/modules/liquidaciones/liquidaciones.routes.ts

import { Router } from 'express';
import { liquidacionesController } from './liquidaciones.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/', liquidacionesController.listar.bind(liquidacionesController));
router.get('/:id', liquidacionesController.obtener.bind(liquidacionesController));
router.post('/', liquidacionesController.crear.bind(liquidacionesController));
router.put('/:id', liquidacionesController.actualizar.bind(liquidacionesController));
router.delete('/:id', liquidacionesController.eliminar.bind(liquidacionesController));

export default router;
