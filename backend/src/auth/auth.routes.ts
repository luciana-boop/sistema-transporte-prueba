// FILE: src/auth/auth.routes.ts

import { Router } from 'express';
import { authController } from './auth.controller';
import { verificarToken } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/login
router.post('/login', authController.login.bind(authController));

// GET /api/auth/perfil  (requiere token)
router.get('/perfil', verificarToken, authController.perfil.bind(authController));

export default router;
