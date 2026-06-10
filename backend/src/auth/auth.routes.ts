// FILE: backend/src/auth/auth.routes.ts

import { Router } from 'express';
import { authController } from './auth.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { loginLimiter } from '../middleware/rateLimit.middleware';
import { permisosService } from '../modules/permisos/permisos.service';

const router = Router();

// POST /api/auth/login
router.post('/login', loginLimiter, authController.login.bind(authController));

// POST /api/auth/logout — limpia las cookies de sesión
router.post('/logout', authController.logout.bind(authController));

// GET /api/auth/perfil  (sin cambios)
router.get('/perfil', verificarToken, authController.perfil.bind(authController));

// GET /api/auth/mis-permisos
// Devuelve los módulos y acciones habilitados para el usuario autenticado.
// El Sidebar del frontend llama a este endpoint al montar.
// ADMIN recibe todo; SECRETARIO recibe solo lo que tiene habilitado.
router.get('/mis-permisos', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario!.id;
    const permisos = await permisosService.obtenerPermisos(usuarioId);
    res.json({ success: true, data: permisos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al obtener permisos';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
