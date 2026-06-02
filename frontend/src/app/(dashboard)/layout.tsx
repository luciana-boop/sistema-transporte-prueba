// FILE: src/app/(dashboard)/layout.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    // Solo evaluamos auth DESPUÉS de que Zustand confirmó
    // que terminó de leer localStorage. Antes de ese momento,
    // isAuthenticated=false no significa "no hay sesión",
    // significa "todavía no sé".
    if (_hasHydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [_hasHydrated, isAuthenticated, router]);

  // Zustand todavía no terminó de leer localStorage:
  // mostramos spinner neutro, no el dashboard ni redirigimos.
  // Este es el único estado donde no sabemos si hay sesión válida.
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Zustand hidratado + sin sesión: retornamos null mientras
  // el router.replace del useEffect procesa la redirección.
  // Nunca se renderiza el dashboard en este estado.
  if (!isAuthenticated) return null;

  // Zustand hidratado + sesión válida: render normal del dashboard.
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
