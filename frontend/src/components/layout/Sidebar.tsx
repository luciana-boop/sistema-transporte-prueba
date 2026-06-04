// FILE: frontend/src/components/layout/Sidebar.tsx
// CAMBIOS respecto al original:
//   1. navItems: reemplaza array 'roles' por 'moduloKey'
//   2. usePermisos() se llama aquí para cargar permisos al montar
//   3. Filtrado usa tieneModulo() en lugar de item.roles.includes(usuario.rol)
//   4. Skeleton mientras permisos cargan (modulos === null)
//   5. logout también llama resetPermisos()

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, FileText, DollarSign,
  Wallet, Receipt, BarChart3, UserCog, Truck, LogOut, ChevronRight,
  UserCheck, Car, ClipboardList, Fuel, Archive, Settings2,
} from 'lucide-react';
import { useAuthStore }      from '@/store/auth.store';
import { usePermisosStore }  from '@/store/permisos.store';
import { usePermisos }       from '@/hooks/usePermisos';
import { useConfig }         from '@/hooks/useConfig';
import { useRouter }         from 'next/navigation';
import { cn }                from '@/lib/utils';
import { toast }             from 'sonner';
import type { ModuloKey }    from '@/config/permisos.config';

// ── navItems: se reemplaza 'roles' por 'moduloKey' ──────────────────────────
// La key debe coincidir exactamente con los valores de MODULOS en permisos.config.ts
const navItems: { href: string; label: string; icon: React.ElementType; moduloKey: ModuloKey }[] = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard, moduloKey: 'dashboard'     },
  { href: '/clientes',      label: 'Clientes',      icon: Users,           moduloKey: 'clientes'      },
  { href: '/pedidos',       label: 'Pedidos',        icon: Package,         moduloKey: 'pedidos'       },
  { href: '/conductores',   label: 'Conductores',   icon: UserCheck,       moduloKey: 'conductores'   },
  { href: '/vehiculos',     label: 'Vehículos',     icon: Car,             moduloKey: 'vehiculos'     },
  { href: '/facturacion',   label: 'Facturación',   icon: FileText,        moduloKey: 'facturacion'   },
  { href: '/cobranza',      label: 'Cobranza',      icon: DollarSign,      moduloKey: 'cobranza'      },
  { href: '/liquidaciones', label: 'Liquidaciones', icon: ClipboardList,   moduloKey: 'liquidaciones' },
  { href: '/combustible',   label: 'Combustible',   icon: Fuel,            moduloKey: 'combustible'   },
  { href: '/caja',          label: 'Caja',          icon: Wallet,          moduloKey: 'caja'          },
  { href: '/gastos',        label: 'Gastos',        icon: Receipt,         moduloKey: 'gastos'        },
  { href: '/reportes',      label: 'Reportes',      icon: BarChart3,       moduloKey: 'reportes'      },
  { href: '/configuracion', label: 'Configuración', icon: Settings2,       moduloKey: 'configuracion' },
  { href: '/backups',       label: 'Backups',       icon: Archive,         moduloKey: 'backups'       },
  { href: '/usuarios',      label: 'Usuarios',      icon: UserCog,         moduloKey: 'usuarios'      },
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

  // Carga los permisos desde la API al montar (solo una vez por sesión)
  usePermisos();

  const handleLogout = () => {
    resetPermisos(); // limpiar permisos al cerrar sesión
    logout();
    toast.success('Sesión cerrada');
    router.push('/login');
  };

  // Permisos todavía no cargados: mostrar skeletons en el nav
  // Condición: auth hidratado + usuario presente + permisos aún null
  const permistosCargando = _hasHydrated && usuario && modulos === null;

  // Filtrar navItems según permisos del store
  const visible = _hasHydrated && usuario && modulos !== null
    ? navItems.filter((item) => tieneModulo(item.moduloKey))
    : [];

  return (
    <aside className="w-60 flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-white" />
        </div>
        {config.isLoading || !_hasHydrated
          ? <div className="h-3 w-24 rounded bg-sidebar-accent animate-pulse" />
          : <span className="font-semibold text-sidebar-foreground text-sm">
              {config.nombreEmpresa}
            </span>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-0.5">

        {/* Skeleton mientras cargan los permisos */}
        {permistosCargando && (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
            >
              <div className="w-4 h-4 rounded bg-sidebar-accent animate-pulse shrink-0" />
              <div className="h-3 rounded bg-sidebar-accent animate-pulse flex-1" />
            </div>
          ))
        )}

        {/* Items visibles según permisos */}
        {!permistosCargando && visible.map((item) => {
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
              {_hasHydrated && usuario
                ? usuario.nombre.charAt(0).toUpperCase()
                : null
              }
            </span>
          </div>
          <div className="flex-1 min-w-0">
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
