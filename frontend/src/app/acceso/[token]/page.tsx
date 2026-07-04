// FILE: src/app/acceso/[token]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Truck, AlertCircle } from 'lucide-react';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/utils';

// Página de aterrizaje del link/QR fijo de un chofer: sin formulario, sin
// pantalla de login. Canjea el token por una sesión real y entra directo al
// módulo de Guías. Pensada para personas mayores: mensajes grandes y simples.
export default function AccesoLinkFijoPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    authApi.accesoLinkFijo(params.token)
      .then((res) => {
        if (cancelado) return;
        const { usuario, csrfToken } = res.data.data;
        setAuth(usuario, csrfToken);
        router.replace('/guias-chofer');
      })
      .catch((err) => {
        if (cancelado) return;
        setError(getErrorMessage(err));
      });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 gap-6 text-center">
      <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30">
        <Truck className="w-8 h-8 text-white" />
      </div>

      {error ? (
        <>
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-lg font-medium max-w-sm">{error}</p>
          <p className="text-base text-muted-foreground max-w-sm">
            Comuníquese con la oficina para obtener un enlace nuevo.
          </p>
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-lg font-medium">Ingresando…</p>
        </>
      )}
    </div>
  );
}
