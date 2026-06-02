// FILE: src/modules/gastos/gastos.routes.ts

import { Router } from 'express';
import { gastosController } from './gastos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario);

router.get('/', gastosController.listar.bind(gastosController));
router.get('/resumen', gastosController.resumen.bind(gastosController));
router.get('/:id', gastosController.obtener.bind(gastosController));
router.post('/', gastosController.crear.bind(gastosController));
router.put('/:id', gastosController.actualizar.bind(gastosController));
router.delete('/:id', gastosController.eliminar.bind(gastosController));

export default router;
