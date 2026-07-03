// FILE: src/components/layout/Topbar.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Moon, Sun, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationsPanel } from '@/components/shared/NotificationsPanel';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/clientes':      'Clientes',
  '/pedidos':       'Pedidos',
  '/conductores':   'Conductores',
  '/vehiculos':     'Vehículos',
  '/facturacion':   'Facturación',
  '/cobranza':      'Cobranza',
  '/liquidaciones': 'Liquidaciones',
  '/combustible':   'Combustible',
  '/caja':          'Caja',
  '/gastos':        'Gastos',
  '/reportes':      'Reportes',
  '/configuracion': 'Configuración',
  '/backups':       'Backups',
  '/usuarios':      'Usuarios',
};

export function Topbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const usuario      = useAuthStore((s) => s.usuario);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { notifications, unreadCount, marcarTodasLeidas, marcarLeida, posponer } = useNotifications();
  const [showNotif, setShowNotif] = useState(false);

  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => { setThemeMounted(true); }, []);

  const base  = '/' + pathname.split('/')[1];
  const label = ROUTE_LABELS[base] || 'Panel';

  return (
    <header className="h-[60px] border-b border-border bg-card flex items-center px-6 gap-4 shrink-0 relative">

      {/* Title + Date */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[17px] font-semibold text-foreground leading-tight">{label}</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
          {new Date().toLocaleDateString('es-PE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">

        {/* Notificaciones */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative"
            title="Notificaciones"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-destructive text-white rounded-full text-[9px] flex items-center justify-center font-bold leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotif && (
            <NotificationsPanel
              notifications={notifications}
              onClose={() => setShowNotif(false)}
              onLeerTodas={marcarTodasLeidas}
              onLeer={marcarLeida}
              onPosponer={posponer}
            />
          )}
        </div>

        {/* Tema */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Cambiar tema"
        >
          {!themeMounted
            ? <Moon className="w-4 h-4 opacity-0" />
            : theme === 'dark'
              ? <Sun  className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
          }
        </button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">
              {_hasHydrated && usuario
                ? usuario.nombre.charAt(0).toUpperCase()
                : null
              }
            </span>
          </div>
          <div className="hidden md:block">
            {_hasHydrated && usuario
              ? <>
                  <p className="text-[12.5px] font-medium leading-none text-foreground">{usuario.nombre}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{usuario.rol}</p>
                </>
              : <div className="w-20 h-3 rounded bg-muted animate-pulse" />
            }
          </div>
        </div>

      </div>
    </header>
  );
}
