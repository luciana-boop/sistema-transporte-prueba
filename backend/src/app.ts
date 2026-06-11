// FILE: backend/src/app.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes          from './auth/auth.routes';
import clientesRoutes      from './modules/clientes/clientes.routes';
import pedidosRoutes       from './modules/pedidos/pedidos.routes';
import facturacionRoutes   from './modules/facturacion/facturacion.routes';
import cobranzaRoutes      from './modules/cobranza/cobranza.routes';
import cajaRoutes          from './modules/caja/caja.routes';
import gastosRoutes        from './modules/gastos/gastos.routes';
import reportesRoutes      from './modules/reportes/reportes.routes';
import usuariosRoutes      from './modules/usuarios/usuarios.routes';
import conductoresRoutes   from './modules/conductores/conductores.routes';
import vehiculosRoutes     from './modules/vehiculos/vehiculos.routes';
import liquidacionesRoutes from './modules/liquidaciones/liquidaciones.routes';
import combustibleRoutes   from './modules/combustible/combustible.routes';
import backupRoutes        from './modules/backup/backup.routes';
import configuracionRoutes from './modules/configuracion/configuracion.routes';
import cuentasRoutes       from './modules/configuracion/cuentas.routes';
import permisosRoutes      from './modules/permisos/permisos.routes';
import { apiLimiter }      from './middleware/rateLimit.middleware';
import { verificarCsrf }   from './middleware/csrf.middleware';

const app = express();

// No revelar el framework subyacente (mitiga reconocimiento por parte de un atacante).
app.disable('x-powered-by');

// ── Seguridad: headers HTTP defensivos ──────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  // HSTS: fuerza HTTPS por 1 año (solo relevante si el servidor usa TLS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // CSP: el backend solo sirve JSON (no HTML de usuario), por lo que se
  // puede aplicar la política más restrictiva posible.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  next();
});

// Orígenes permitidos: configurables vía CORS_ORIGIN (lista separada por comas).
// Además se permiten los preview deployments del proyecto en Vercel
// (subdominios con prefijo "transportessalvadorr-...-transporte-salva.vercel.app"),
// el dominio de producción "transportessalvadorr.vercel.app",
// y, fuera de producción, cualquier http://localhost:*.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const vercelPreviewPattern = /^https:\/\/transportessalvadorr-[a-z0-9-]+-transporte-salva\.vercel\.app$/;
const vercelProductionPattern = /^https:\/\/transportessalvadorr\.vercel\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const permitido =
      corsOrigins.includes(origin) ||
      vercelPreviewPattern.test(origin) ||
      vercelProductionPattern.test(origin) ||
      (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin));

    if (permitido) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiLimiter);

app.use('/api/auth',          authRoutes);

// CSRF aplica a partir de aquí: login/logout no dependen de la cookie csrf_token
// (login aún no la tiene; logout solo limpia cookies y no muta datos de negocio).
app.use('/api', verificarCsrf);
app.use('/api/clientes',      clientesRoutes);
app.use('/api/pedidos',       pedidosRoutes);
app.use('/api/facturacion',   facturacionRoutes);
app.use('/api/cobranza',      cobranzaRoutes);
app.use('/api/caja',          cajaRoutes);
app.use('/api/gastos',        gastosRoutes);
app.use('/api/reportes',      reportesRoutes);
app.use('/api/usuarios',      usuariosRoutes);
app.use('/api/conductores',   conductoresRoutes);
app.use('/api/vehiculos',     vehiculosRoutes);
app.use('/api/liquidaciones', liquidacionesRoutes);
app.use('/api/combustible',   combustibleRoutes);
app.use('/api/backup',        backupRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/cuentas',       cuentasRoutes);
app.use('/api/permisos',      permisosRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
});

export default app;
