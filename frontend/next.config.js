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
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
