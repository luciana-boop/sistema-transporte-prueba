// FILE: src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, FileText, DollarSign,
  Wallet, Receipt, BarChart3, UserCog, Truck, LogOut, ChevronRight,
  UserCheck, Car, ClipboardList, Fuel, Archive, Settings2,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useConfig } from '@/hooks/useConfig';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard, roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/clientes',      label: 'Clientes',      icon: Users,           roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/pedidos',       label: 'Pedidos',        icon: Package,         roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/conductores',   label: 'Conductores',   icon: UserCheck,       roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/vehiculos',     label: 'Vehículos',     icon: Car,             roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/facturacion',   label: 'Facturación',   icon: FileText,        roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/cobranza',      label: 'Cobranza',      icon: DollarSign,      roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/liquidaciones', label: 'Liquidaciones', icon: ClipboardList,   roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/combustible',   label: 'Combustible',   icon: Fuel,            roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/caja',          label: 'Caja',          icon: Wallet,          roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/gastos',        label: 'Gastos',        icon: Receipt,         roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/reportes',      label: 'Reportes',      icon: BarChart3,       roles: ['ADMIN', 'SECRETARIO'] },
  { href: '/configuracion', label: 'Configuración',  icon: Settings2,       roles: ['ADMIN'] },
  { href: '/backups',       label: 'Backups',        icon: Archive,         roles: ['ADMIN'] },
  { href: '/usuarios',      label: 'Usuarios',      icon: UserCog,         roles: ['ADMIN'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const usuario      = useAuthStore((s) => s.usuario);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { logout }   = useAuthStore();
  const config       = useConfig();

  const handleLogout = () => {
    logout();
    toast.success('Sesión cerrada');
    router.push('/login');
  };

  // ── NUEVO: calculamos visible solo cuando sabemos quién es el usuario ──
  // Antes: usuario=null → visible=[] → sidebar vacío → re-render al llegar usuario
  // Ahora: esperamos _hasHydrated para calcular visible una sola vez con el valor final
  const visible = _hasHydrated && usuario
    ? navItems.filter((item) => item.roles.includes(usuario.rol))
    : [];
  // ──────────────────────────────────────────────────────────────────────

  return (
    <aside className="w-60 flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-white" />
        </div>
        {/* ── NUEVO: placeholder hasta que useConfig resuelva el nombre real ── */}
        {config.isLoading || !_hasHydrated
          ? <div className="h-3 w-24 rounded bg-sidebar-accent animate-pulse" />
          : <span className="font-semibold text-sidebar-foreground text-sm">
              {config.nombreEmpresa}
            </span>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-0.5">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group',
                active
                  ? 'bg-primary text-white font-medium shadow-sm shadow-primary/30'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              )}
            >
              <item.icon className={cn(
                'w-4 h-4 shrink-0',
                active
                  ? 'text-white'
                  : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground'
              )} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent mb-1">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {/* ── NUEVO: inicial solo cuando usuario está confirmado ── */}
              {_hasHydrated && usuario
                ? usuario.nombre.charAt(0).toUpperCase()
                : null
              }
            </span>
          </div>
          <div className="flex-1 min-w-0">
            {/* ── NUEVO: placeholder mientras hidrata ── */}
            {_hasHydrated && usuario
              ? <>
                  <p className="text-xs font-medium text-sidebar-foreground truncate">{usuario.nombre}</p>
                  <p className="text-xs text-sidebar-foreground/50">{usuario.rol}</p>
                </>
              : <div className="space-y-1">
                  <div className="h-2.5 w-20 rounded bg-sidebar-border animate-pulse" />
                  <div className="h-2   w-12 rounded bg-sidebar-border animate-pulse" />
                </div>
            }
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar sesión</span>
        </button>
      </div>

    </aside>
  );
}
