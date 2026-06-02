// FILE: src/modules/conductores/conductores.routes.ts

import { Router } from 'express';
import { conductoresController } from './conductores.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/', conductoresController.listar.bind(conductoresController));
router.get('/:id', conductoresController.obtener.bind(conductoresController));
router.post('/', conductoresController.crear.bind(conductoresController));
router.put('/:id', conductoresController.actualizar.bind(conductoresController));
router.delete('/:id', conductoresController.eliminar.bind(conductoresController));

export default router;
