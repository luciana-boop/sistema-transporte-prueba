// FILE: src/modules/clientes/clientes.routes.ts

import { Router } from 'express';
import { clientesController } from './clientes.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();

// Todos los endpoints requieren autenticación
router.use(verificarToken, adminOSecretario);

router.get('/', clientesController.listar.bind(clientesController));
router.get('/:id', clientesController.obtener.bind(clientesController));
router.get('/:id/estadisticas', clientesController.estadisticas.bind(clientesController));
router.post('/', clientesController.crear.bind(clientesController));
router.put('/:id', clientesController.actualizar.bind(clientesController));
router.delete('/:id', clientesController.eliminar.bind(clientesController));

export default router;
