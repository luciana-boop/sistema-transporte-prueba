// FILE: frontend/src/app/(dashboard)/usuarios/[id]/permisos/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore }      from '@/store/auth.store';
import { usePermisosAdmin }  from '@/hooks/usePermisosAdmin';
import { PermisosPanel }     from '@/components/permisos/PermisosPanel';

export default function PermisosUsuarioPage() {
  const params  = useParams();
  const router  = useRouter();
  const usuario = useAuthStore((s) => s.usuario);

  const usuarioId = parseInt(params.id as string);

  // Protección frontend: solo ADMIN puede ver esta página
  if (usuario?.rol !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">No tenés permiso para acceder a esta sección.</p>
      </div>
    );
  }

  if (isNaN(usuarioId)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">ID de usuario inválido.</p>
      </div>
    );
  }

  return <PermisosContent usuarioId={usuarioId} />;
}

// Separado para poder usar el hook sin condicionales
function PermisosContent({ usuarioId }: { usuarioId: number }) {
  const router = useRouter();
  const { data, cargando, guardando, error, guardar } = usePermisosAdmin(usuarioId);

  // ── Cargando ──────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Error al cargar permisos</p>
            <p className="text-sm text-muted-foreground mt-1">{error ?? 'Ocurrió un error inesperado.'}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista principal ───────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/usuarios')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a usuarios
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Permisos de {data.usuario.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">{data.usuario.email}</p>
          </div>
        </div>
      </div>

      {/* Panel de permisos */}
      <PermisosPanel
        data={data}
        guardando={guardando}
        onGuardar={guardar}
      />

    </div>
  );
}
