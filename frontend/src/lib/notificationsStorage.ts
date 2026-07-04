// FILE: src/lib/notificationsStorage.ts
// Persistencia local (localStorage) del estado de notificaciones, por usuario.
// - "leída" y "pospuesta" (recordar más tarde) se ocultan solo hasta el
//   próximo inicio de sesión — ver auth.store.ts (setAuth), que llama a
//   reiniciarEstadoSesion() ahí. Así, una alerta de vencimiento (SOAT,
//   revisión técnica, licencia, mantenimiento, facturas vencidas) marcada
//   como leída vuelve a aparecer en la siguiente sesión si la condición que
//   la generó (el mismo id) sigue vigente; si ya se resolvió (se pagó, se
//   renovó, etc.), useNotifications ya no vuelve a generar ese id y no
//   reaparece.

interface EstadoNotificaciones {
  vistos: Record<string, number>;
  leidas: string[];
  pospuestas: string[];
}

const VACIO: EstadoNotificaciones = { vistos: {}, leidas: [], pospuestas: [] };

function clave(usuarioId: number): string {
  return `notif_estado_${usuarioId}`;
}

function leerEstado(usuarioId: number): EstadoNotificaciones {
  if (typeof window === 'undefined') return { ...VACIO };
  try {
    const raw = window.localStorage.getItem(clave(usuarioId));
    if (!raw) return { vistos: {}, leidas: [], pospuestas: [] };
    const parsed = JSON.parse(raw);
    return {
      vistos: parsed.vistos ?? {},
      leidas: Array.isArray(parsed.leidas) ? parsed.leidas : [],
      pospuestas: Array.isArray(parsed.pospuestas) ? parsed.pospuestas : [],
    };
  } catch {
    return { vistos: {}, leidas: [], pospuestas: [] };
  }
}

function guardarEstado(usuarioId: number, estado: EstadoNotificaciones): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(clave(usuarioId), JSON.stringify(estado));
}

// Registra el primer momento en que se vio cada id (usado para ordenar
// "nuevas arriba") y devuelve el mapa completo de timestamps.
export function registrarVistos(usuarioId: number, ids: string[]): Record<string, number> {
  const estado = leerEstado(usuarioId);
  let cambio = false;
  const ahora = Date.now();
  for (const id of ids) {
    if (!(id in estado.vistos)) {
      estado.vistos[id] = ahora;
      cambio = true;
    }
  }
  if (cambio) guardarEstado(usuarioId, estado);
  return estado.vistos;
}

export function obtenerOcultos(usuarioId: number): Set<string> {
  const estado = leerEstado(usuarioId);
  return new Set([...estado.leidas, ...estado.pospuestas]);
}

export function marcarLeida(usuarioId: number, id: string): void {
  const estado = leerEstado(usuarioId);
  if (!estado.leidas.includes(id)) estado.leidas.push(id);
  guardarEstado(usuarioId, estado);
}

export function marcarTodasLeidas(usuarioId: number, ids: string[]): void {
  const estado = leerEstado(usuarioId);
  for (const id of ids) {
    if (!estado.leidas.includes(id)) estado.leidas.push(id);
  }
  guardarEstado(usuarioId, estado);
}

export function posponer(usuarioId: number, id: string): void {
  const estado = leerEstado(usuarioId);
  if (!estado.pospuestas.includes(id)) estado.pospuestas.push(id);
  guardarEstado(usuarioId, estado);
}

// Se llama al iniciar sesión: tanto las notificaciones leídas como las
// pospuestas vuelven a aparecer (si la condición que las generó sigue vigente).
export function reiniciarEstadoSesion(usuarioId: number): void {
  const estado = leerEstado(usuarioId);
  if (estado.leidas.length === 0 && estado.pospuestas.length === 0) return;
  estado.leidas = [];
  estado.pospuestas = [];
  guardarEstado(usuarioId, estado);
}
