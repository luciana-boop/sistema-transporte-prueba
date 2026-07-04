// FILE: src/app/(auth)/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Truck } from 'lucide-react';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/utils';

const loginSchema = z.object({
  email:    z.string().min(1, 'El email es requerido').email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router           = useRouter();
  const setAuth          = useAuthStore((s) => s.setAuth);
  const isAuthenticated  = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated     = useAuthStore((s) => s._hasHydrated);
  const [showPass, setShowPass] = useState(false);

  // ── NUEVO: reemplaza el patrón mounted/useEffect por _hasHydrated ──
  // Antes: mounted=false → return null → fondo azul vacío visible 1 frame
  // Ahora: el formulario renderiza desde el primer frame. Solo redirigimos
  // cuando Zustand confirma que hay sesión activa (_hasHydrated=true).
  useEffect(() => {
    if (_hasHydrated && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [_hasHydrated, isAuthenticated, router]);
  // ──────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await authApi.login(data.email, data.password);
      const { usuario, csrfToken } = res.data.data;
      setAuth(usuario, csrfToken);
      toast.success(`Bienvenido, ${usuario.nombre}`);
      router.push('/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="w-full max-w-sm animate-fade-in">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8 gap-3">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
          <Truck className="w-6 h-6 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Transportes Salvador</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de gestión empresarial</p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">Iniciar sesión</h2>
        <p className="text-sm text-muted-foreground mb-6">Ingresa tus credenciales para continuar</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="usuario@transportes.com"
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all aria-invalid:border-destructive"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all aria-invalid:border-destructive"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full bg-primary text-primary-foreground font-medium py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
