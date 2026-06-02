// FILE: src/components/layout/Topbar.tsx
// MODIFICADO: sistema de notificaciones con contador y dropdown
'use client';

import { usePathname } from 'next/navigation';
import { Moon, Sun, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import { useNotifications } from '@/hooks/useNotifications';
import { useConfig } from '@/hooks/useConfig';
import { NotificationsPanel } from '@/components/shared/NotificationsPanel';
import { useState } from 'react';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/clientes':     'Clientes',
  '/pedidos':      'Pedidos',
  '/conductores':  'Conductores',
  '/vehiculos':    'Vehículos',
  '/facturacion':  'Facturación',
  '/cobranza':     'Cobranza',
  '/liquidaciones':'Liquidaciones',
  '/combustible':  'Combustible',
  '/caja':         'Caja',
  '/gastos':       'Gastos',
  '/reportes':     'Reportes',
  '/configuracion':'Configuración',
  '/backups':      'Backups',
  '/usuarios':     'Usuarios',
};

export function Topbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { usuario } = useAuthStore();
  const config = useConfig();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [showNotif, setShowNotif] = useState(false);

  const base = '/' + pathname.split('/')[1];
  const label = ROUTE_LABELS[base] || 'Panel';

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center px-6 gap-4 shrink-0 relative">
      {/* Breadcrumb */}
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-foreground">{label}</h1>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all relative"
            title="Notificaciones"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-[9px] flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotif && (
            <NotificationsPanel
              notifications={notifications}
              onClose={() => setShowNotif(false)}
              onMarkAllRead={markAllRead}
              onMarkRead={markRead}
            />
          )}
        </div>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          title="Cambiar tema"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="h-6 w-px bg-border mx-1" />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">
              {usuario?.nombre.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium leading-none">{usuario?.nombre}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{usuario?.rol}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
