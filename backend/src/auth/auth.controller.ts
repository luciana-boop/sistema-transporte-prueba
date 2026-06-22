// FILE: src/auth/auth.controller.ts

import { Request, Response } from 'express';
import crypto from 'crypto';
import { authService } from './auth.service';
import { duracionAMs } from '../utils/duration';

const esProduccion = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE = duracionAMs(process.env.JWT_EXPIRES_IN || '2h', 2 * 60 * 60 * 1000);

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email y contraseña son requeridos' });
        return;
      }

      const { token, csrfToken, usuario } = await authService.login({ email, password });

      // SameSite=None es necesario porque frontend (Vercel) y backend (Render)
      // son dominios distintos (cookie cross-site). Esto desactiva las
      // protecciones CSRF nativas del navegador, por lo que la mitigación
      // recae en el middleware `verificarCsrf` (patrón double-submit cookie).
      res.cookie('token', token, {
        httpOnly: true,
        secure: esProduccion,
        sameSite: esProduccion ? 'none' : 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });

      // Cookie legible por JS (httpOnly: false es INTENCIONAL): el frontend la
      // reenvía como header X-CSRF-Token en mutaciones (patrón double-submit
      // cookie). No es un secreto de autenticación — su única función es
      // probar same-origin, ya que un sitio atacante no puede leerla.
      res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        secure: esProduccion,
        sameSite: esProduccion ? 'none' : 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });

      res.json({
        success: true,
        message: 'Sesión iniciada correctamente',
        data: { usuario, csrfToken },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión';
      res.status(401).json({ success: false, error: message });
    }
  }

  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie('token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
    res.json({ success: true, message: 'Sesión cerrada' });
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

  // GET /api/auth/me — valida la sesión tras un refresh y rota el csrf_token,
  // ya que el frontend no puede leer la cookie csrf_token (cross-origin) y
  // depende de este valor en el body para reconstruir su store persistido.
  async me(req: Request, res: Response): Promise<void> {
    try {
      const usuarioId = (req as any).usuario.id;
      const usuario = await authService.getProfile(usuarioId);

      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        secure: esProduccion,
        sameSite: esProduccion ? 'none' : 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });

      res.json({ success: true, data: { usuario, csrfToken } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al validar sesión';
      res.status(500).json({ success: false, error: message });
    }
  }
}

export const authController = new AuthController();
