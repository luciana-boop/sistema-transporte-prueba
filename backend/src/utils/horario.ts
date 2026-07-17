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

// Formatea un Date real (con hora) a fecha en horario de Peru para el
// payload de cutyfact. `.toISOString()` siempre devuelve UTC: cualquier
// instante creado entre las 19:00 y 23:59 hora Peru queda con la fecha del
// dia siguiente si se usa directamente, porque Lima es UTC-5 fijo (sin
// horario de verano) y nadie fija TZ=America/Lima en el proceso.
export function fechaHoraSunat(fecha: Date): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;

  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    hora: `${valor('hour')}:${valor('minute')}:${valor('second')}`,
  };
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
