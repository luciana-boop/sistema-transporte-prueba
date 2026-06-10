// FILE: backend/src/utils/duration.ts

// Convierte expresiones simples de duración ("2h", "30m", "7d", "45s" o segundos
// como número/string) a milisegundos. Usado para sincronizar la expiración del
// JWT con el maxAge de la cookie httpOnly.
export function duracionAMs(valor: string, porDefectoMs: number): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(valor.trim());
  if (!match) return porDefectoMs;

  const cantidad = Number(match[1]);
  const unidad = match[2] ?? 's';

  const factores: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return cantidad * factores[unidad];
}
