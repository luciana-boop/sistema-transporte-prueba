// FILE: backend/src/modules/permisos/permisos.routes.ts

import { Router } from 'express';
import { permisosController } from './permisos.controller';
import { verificarToken, soloAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Todos los endpoints de permisos son exclusivos del ADMIN
router.use(verificarToken, soloAdmin);

// GET  /api/permisos/:id  → obtener permisos de un usuario (panel de admin)
router.get('/:id', permisosController.obtener.bind(permisosController));

// PUT  /api/permisos/:id  → guardar permisos de un usuario
router.put('/:id', permisosController.guardar.bind(permisosController));

export default router;
