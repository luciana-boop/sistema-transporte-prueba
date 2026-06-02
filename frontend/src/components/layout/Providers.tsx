// FILE: src/components/layout/Providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    // Cambios en ThemeProvider:
    // 1. disableTransitionOnChange: evita que el cambio de tema
    //    dispare transiciones CSS durante la hidratación inicial
    // 2. enableSystem eliminado: el sistema operativo no es accesible
    //    en el servidor, causaba mismatch garantizado en cada carga
    // 3. defaultTheme="dark" se mantiene: el tema oscuro es el correcto
    //    para este sistema y es predecible en servidor y cliente
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: { fontFamily: 'DM Sans, sans-serif', fontSize: '14px' },
          }}
        />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
