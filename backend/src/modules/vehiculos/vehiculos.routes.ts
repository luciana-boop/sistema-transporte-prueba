// FILE: src/modules/vehiculos/vehiculos.routes.ts

import { Router } from 'express';
import { vehiculosController } from './vehiculos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/', vehiculosController.listar.bind(vehiculosController));
router.get('/:id', vehiculosController.obtener.bind(vehiculosController));
router.post('/', vehiculosController.crear.bind(vehiculosController));
router.put('/:id', vehiculosController.actualizar.bind(vehiculosController));
router.delete('/:id', vehiculosController.eliminar.bind(vehiculosController));

export default router;
