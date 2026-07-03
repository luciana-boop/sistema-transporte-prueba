// FILE: src/utils/horario.ts

const ZONA_HORARIA = 'America/Lima';

const DIAS_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

// Devuelve el día (1=Lunes...7=Domingo) y la hora ("HH:mm") actuales en hora Perú,
// sin importar la zona horaria del servidor donde corre el backend.
export function obtenerDiaYHoraActual(): { dia: number; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const weekday = partes.find((p) => p.type === 'weekday')!.value;
  let hour = partes.find((p) => p.type === 'hour')!.value;
  const minute = partes.find((p) => p.type === 'minute')!.value;
  if (hour === '24') hour = '00';

  return { dia: DIAS_ISO[weekday], hora: `${hour}:${minute}` };
}

export interface RestriccionHorario {
  diasPermitidos: number[];
  horaInicio: string | null;
  horaFin: string | null;
}

// Comparación lexicográfica sobre "HH:mm" — válido para rangos dentro del mismo
// día (no soporta horarios que cruzan medianoche, ej. 22:00-02:00).
export function dentroDeHorario(restriccion: RestriccionHorario): boolean {
  const { dia, hora } = obtenerDiaYHoraActual();

  if (!restriccion.diasPermitidos.includes(dia)) return false;
  if (restriccion.horaInicio && hora < restriccion.horaInicio) return false;
  if (restriccion.horaFin && hora > restriccion.horaFin) return false;

  return true;
}
