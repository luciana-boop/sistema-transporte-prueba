// FILE: src/auth/auth.controller.ts

import { Request, Response } from 'express';
import { authService } from './auth.service';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email y contraseña son requeridos' });
        return;
      }

      const result = await authService.login({ email, password });

      res.json({
        success: true,
        message: 'Sesión iniciada correctamente',
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión';
      res.status(401).json({ success: false, error: message });
    }
  }

  async perfil(req: Request, res: Response): Promise<void> {
    try {
      const usuarioId = (req as any).usuario.id;
      const perfil = await authService.getProfile(usuarioId);
      res.json({ success: true, data: perfil });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener perfil';
      res.status(500).json({ success: false, error: message });
    }
  }
}

export const authController = new AuthController();
