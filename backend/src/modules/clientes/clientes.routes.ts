// FILE: src/modules/clientes/clientes.routes.ts

import { Router } from 'express';
import { clientesController } from './clientes.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';

const router = Router();

// Todos los endpoints requieren autenticación + permiso de acceso al módulo
router.use(verificarToken, adminOSecretario, verificarModulo('clientes'));

router.get('/', clientesController.listar.bind(clientesController));
router.get('/:id', clientesController.obtener.bind(clientesController));
router.post('/', clientesController.crear.bind(clientesController));
router.put('/:id', clientesController.actualizar.bind(clientesController));
router.delete('/:id', clientesController.eliminar.bind(clientesController));

export default router;
