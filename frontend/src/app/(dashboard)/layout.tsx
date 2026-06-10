// FILE: src/app/(dashboard)/layout.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/services/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router           = useRouter();
  const isAuthenticated  = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated     = useAuthStore((s) => s._hasHydrated);
  const isTokenVerified  = useAuthStore((s) => s.isTokenVerified);
  const setTokenVerified = useAuthStore((s) => s.setTokenVerified);
  const setCsrfToken     = useAuthStore((s) => s.setCsrfToken);

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (isTokenVerified) return;

    // Token rehidratado desde localStorage pero nunca validado contra el backend.
    // Una llamada liviana confirma que el token sigue siendo válido y rota el
    // csrfToken (no se puede leer la cookie csrf_token cross-origin).
    authApi.me()
      .then((res) => {
        setCsrfToken(res.data.data.csrfToken);
        setTokenVerified(true);
      })
      .catch((err) => {
        // 401 → el interceptor de api.ts limpia localStorage y redirige a /login.
        // Cualquier otro error (red caída, 500) → dejamos pasar al usuario;
        // el próximo request de datos fallará con el error real.
        if (err.response?.status !== 401) {
          setTokenVerified(true);
        }
      });
  }, [_hasHydrated, isAuthenticated, isTokenVerified, setTokenVerified, router]);

  // Zustand todavía leyendo localStorage, O token válido aún no confirmado.
  if (!_hasHydrated || (isAuthenticated && !isTokenVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Hidratado sin sesión: null mientras router.replace procesa la redirección.
  if (!isAuthenticated) return null;

  // Hidratado + sesión válida + token verificado: render normal.
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
