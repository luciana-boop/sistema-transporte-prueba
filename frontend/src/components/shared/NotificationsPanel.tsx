// FILE: src/components/shared/NotificationsPanel.tsx
'use client';

import { AlertTriangle, XCircle, Info, CheckCheck, Check, Clock, X } from 'lucide-react';
import type { Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<string, string> = {
  soat: 'SOAT',
  licencia: 'Licencia',
  revision: 'Rev. Técnica',
  cobranza: 'Cobranza',
  mantenimiento: 'Mantenimiento',
  seguridad: 'Seguridad',
};

const typeIcon = {
  danger:  <XCircle className="w-4 h-4 text-destructive shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />,
  info:    <Info className="w-4 h-4 text-blue-500 shrink-0" />,
};

export function NotificationsPanel({
  notifications, onClose, onLeerTodas, onLeer, onPosponer,
}: {
  notifications: Notification[];
  onClose: () => void;
  onLeerTodas: () => void;
  onLeer: (id: string) => void;
  onPosponer: (id: string) => void;
}) {
  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 top-12 z-50 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notificaciones</p>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={onLeerTodas}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Marcar todas como leídas"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List (más nuevas arriba) */}
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
              <CheckCheck className="w-8 h-8 opacity-30" />
              <p className="text-xs">Sin notificaciones pendientes</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors'
                )}
              >
                {typeIcon[n.type]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold truncate">{n.title}</p>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                      {CATEGORY_LABEL[n.category]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button
                    onClick={() => onLeer(n.id)}
                    title="Marcar como leída"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-emerald-600 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onPosponer(n.id)}
                    title="Recordar más tarde (vuelve a aparecer en el próximo inicio de sesión)"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
