// FILE: src/modules/combustible/combustible.routes.ts

import { Router } from 'express';
import { combustibleController } from './combustible.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/', combustibleController.listar.bind(combustibleController));
router.get('/resumen', combustibleController.resumen.bind(combustibleController));
router.get('/:id', combustibleController.obtener.bind(combustibleController));
router.post('/', combustibleController.crear.bind(combustibleController));
router.put('/:id', combustibleController.actualizar.bind(combustibleController));
router.delete('/:id', combustibleController.eliminar.bind(combustibleController));

export default router;
