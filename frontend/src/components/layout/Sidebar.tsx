// FILE: frontend/src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, FileText, ArrowLeftRight,
  Wallet, BarChart3, UserCog, Truck, LogOut,
  UserCheck, Car, ClipboardList, Fuel, Archive, Settings2, FileOutput,
  HandCoins, Wrench,
} from 'lucide-react';
import { useAuthStore }      from '@/store/auth.store';
import { usePermisosStore }  from '@/store/permisos.store';
import { usePermisos }       from '@/hooks/usePermisos';
import { useConfig }         from '@/hooks/useConfig';
import { useRouter }         from 'next/navigation';
import { cn }                from '@/lib/utils';
import { toast }             from 'sonner';
import { authApi }           from '@/services/api';
import type { ModuloKey }    from '@/config/permisos.config';

const navGroups: {
  label: string;
  items: { href: string; label: string; icon: React.ElementType; moduloKey: ModuloKey }[];
}[] = [
  {
    label: 'Operación',
    items: [
      { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard, moduloKey: 'dashboard'   },
      { href: '/clientes',    label: 'Clientes',    icon: Users,           moduloKey: 'clientes'    },
      { href: '/pedidos',     label: 'Pedidos',     icon: Package,         moduloKey: 'pedidos'     },
      { href: '/conductores', label: 'Conductores', icon: UserCheck,       moduloKey: 'conductores' },
      { href: '/vehiculos',   label: 'Vehículos',   icon: Car,             moduloKey: 'vehiculos'   },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/facturacion',   label: 'Facturación',   icon: FileText,     moduloKey: 'facturacion'   },
      { href: '/guias',         label: 'Guías',         icon: FileOutput,   moduloKey: 'guias'         },
      { href: '/movimientos',   label: 'Movimientos',   icon: ArrowLeftRight, moduloKey: 'movimientos' },
      { href: '/cobranza',      label: 'Cobranza',      icon: HandCoins,    moduloKey: 'cobranza'      },
      { href: '/mantenimiento', label: 'Mantenimiento', icon: Wrench,       moduloKey: 'mantenimiento' },
      { href: '/liquidaciones', label: 'Liquidaciones', icon: ClipboardList,moduloKey: 'liquidaciones' },
      { href: '/combustible',   label: 'Combustible',   icon: Fuel,         moduloKey: 'combustible'   },
      { href: '/caja',          label: 'Caja',          icon: Wallet,       moduloKey: 'caja'          },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/reportes',      label: 'Reportes',      icon: BarChart3,    moduloKey: 'reportes'      },
      { href: '/configuracion', label: 'Configuración', icon: Settings2,    moduloKey: 'configuracion' },
      { href: '/backups',       label: 'Backups',       icon: Archive,      moduloKey: 'backups'       },
      { href: '/usuarios',      label: 'Usuarios',      icon: UserCog,      moduloKey: 'usuarios'      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const usuario      = useAuthStore((s) => s.usuario);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { logout }   = useAuthStore();
  const config       = useConfig();

  const modulos       = usePermisosStore((s) => s.modulos);
  const tieneModulo   = usePermisosStore((s) => s.tieneModulo);
  const resetPermisos = usePermisosStore((s) => s.resetPermisos);

  usePermisos();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // si falla la llamada igual limpiamos la sesión local
    }
    resetPermisos();
    logout();
    toast.success('Sesión cerrada');
    router.push('/login');
  };

  const permistosCargando = _hasHydrated && usuario && modulos === null;

  const visibleGroups = _hasHydrated && usuario && modulos !== null
    ? navGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => tieneModulo(item.moduloKey)),
        }))
        .filter((g) => g.items.length > 0)
    : [];

  return (
    <aside className="w-[236px] flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[60px] border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-white" />
        </div>
        {config.isLoading || !_hasHydrated
          ? <div className="h-3 w-24 rounded bg-sidebar-accent animate-pulse" />
          : <span className="font-semibold text-sidebar-foreground text-[13.5px] truncate">
              {config.nombreEmpresa}
            </span>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">

        {/* Skeletons mientras permisos cargan */}
        {permistosCargando && (
          <div className="flex flex-col gap-0.5 pt-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg">
                <div className="w-4 h-4 rounded bg-sidebar-accent animate-pulse shrink-0" />
                <div className="h-3 rounded bg-sidebar-accent animate-pulse flex-1" />
              </div>
            ))}
          </div>
        )}

        {/* Grupos visibles */}
        {!permistosCargando && visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40 px-2.5 pt-4 pb-1.5">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-colors group',
                    active
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <item.icon className={cn(
                    'w-4 h-4 shrink-0',
                    active
                      ? 'text-primary'
                      : 'text-sidebar-foreground/35 group-hover:text-sidebar-foreground/70'
                  )} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg bg-sidebar-accent mb-1">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {_hasHydrated && usuario
                ? usuario.nombre.charAt(0).toUpperCase()
                : null
              }
            </span>
          </div>
          <div className="flex-1 min-w-0">
            {_hasHydrated && usuario
              ? <>
                  <p className="text-[12.5px] font-medium text-sidebar-foreground truncate leading-tight">{usuario.nombre}</p>
                  <p className="text-[11px] text-sidebar-foreground/50 leading-tight mt-0.5">{usuario.rol}</p>
                </>
              : <div className="space-y-1">
                  <div className="h-2.5 w-20 rounded bg-sidebar-border animate-pulse" />
                  <div className="h-2 w-12 rounded bg-sidebar-border animate-pulse" />
                </div>
            }
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar sesión</span>
        </button>
      </div>

    </aside>
  );
}
