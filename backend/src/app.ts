// FILE: backend/src/app.ts
// CAMBIO: se agregan 2 líneas marcadas con ── NUEVO ──
// Todo lo demás permanece idéntico.

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
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
import permisosRoutes      from './modules/permisos/permisos.routes'; // ── NUEVO ──

const app = express();

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
  next();
});

// ── CORS: solo orígenes explícitamente declarados ────────────────────────────
const corsOrigins = [
  'http://localhost:3000',
  'https://transportessalvadorr-iuinr2f0n-transporte-salva.vercel.app',
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Peticiones sin origen (curl, Postman) se permiten solo en desarrollo
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origen no permitido por CORS'));
      }
      return callback(null, true);
    }
    const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    const isAllowed = corsOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && isLocalhost);
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth',          authRoutes);
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
app.use('/api/permisos',      permisosRoutes);  // ── NUEVO ──

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
