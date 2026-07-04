/** @type {import('next').NextConfig} */

const apiOrigin = process.env.NEXT_PUBLIC_API_URL || 'https://sistema-transporte-prueba.onrender.com';

// Nota sobre 'unsafe-inline' en script-src/style-src:
// Next.js (App Router) con renderizado estático embebe scripts de hidratación
// inline (__next_f) en el HTML pre-generado. Una CSP basada en nonce requiere
// que TODAS las rutas se rendericen dinámicamente (force-dynamic), lo que
// eliminaría el cacheo estático de página completa en Vercel para todo el
// sitio. Se acepta 'unsafe-inline' para script-src/style-src como riesgo
// residual documentado; no se ejecuta JS de terceros (no hay scripts de
// analytics/ads) y la API solo acepta el origen propio (connect-src).
// En desarrollo, Next.js necesita 'unsafe-eval' en script-src para el
// Fast Refresh / HMR de webpack (usa eval() para los source maps). Sin esto,
// el navegador bloquea la ejecución de todo el JS y la app queda en blanco.
// En producción (build real) no hace falta y se mantiene la política estricta.
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxea /api/* al backend (mismo origen desde la perspectiva del navegador).
  // Necesario porque frontend (Vercel) y backend (Render) son dominios
  // distintos: Safari/iOS bloquea por completo las cookies de terceros
  // (la cookie de sesión httpOnly, aunque sea SameSite=None; Secure), lo que
  // hacía que el login pareciera exitoso pero la sesión nunca persistiera.
  // Con este rewrite, el navegador solo habla con su propio origen y la
  // cookie que llega en la respuesta se guarda como de primera parte.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
