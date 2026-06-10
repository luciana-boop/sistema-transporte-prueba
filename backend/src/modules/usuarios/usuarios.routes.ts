// FILE: src/modules/usuarios/usuarios.routes.ts

import { Router } from 'express';
import { usuariosController } from './usuarios.controller';
import { verificarToken, soloAdmin } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';

const router = Router();

// Todos los endpoints de usuarios son solo para ADMIN
router.use(verificarToken, soloAdmin, verificarModulo('usuarios'));

router.get('/', usuariosController.listar.bind(usuariosController));
router.get('/:id', usuariosController.obtener.bind(usuariosController));
router.post('/', usuariosController.crear.bind(usuariosController));
router.put('/:id', usuariosController.actualizar.bind(usuariosController));
router.patch('/:id/password', usuariosController.cambiarPassword.bind(usuariosController));
router.delete('/:id', usuariosController.eliminar.bind(usuariosController));

export default router;
