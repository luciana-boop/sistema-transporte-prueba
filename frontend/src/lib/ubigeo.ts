// Padrón de ubigeo INEI (1892 distritos) + detección heurística a partir de una dirección de texto libre.
// No es geocodificación: busca nombres de distrito dentro del texto de la dirección.
// Solo es confiable cuando la dirección menciona el distrito explícitamente.
import ubigeoData from '@/data/ubigeo-peru.json';

export interface UbigeoEntry {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

const DATA = ubigeoData as UbigeoEntry[];

// Rango Unicode de marcas diacríticas combinantes (U+0300-U+036F). Se arma con fromCharCode
// para no dejar caracteres combinantes crudos en el código fuente (rompen algunos bundlers).
const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Nombre de distrito normalizado -> entradas (puede haber varias con el mismo nombre en distintas provincias)
const distritosPorNombre = new Map<string, UbigeoEntry[]>();
for (const e of DATA) {
  const key = normalizar(e.distrito);
  const arr = distritosPorNombre.get(key) ?? [];
  arr.push(e);
  distritosPorNombre.set(key, arr);
}

// Nombres ordenados por cantidad de palabras (desc) para priorizar coincidencias más específicas
// (p. ej. "SAN JUAN DE LURIGANCHO" antes que "SAN JUAN").
const nombresDistritoOrdenados = [...distritosPorNombre.keys()].sort(
  (a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length
);

export function buscarPorCodigo(ubigeo: string | null | undefined): UbigeoEntry | null {
  if (!ubigeo || ubigeo.length !== 6) return null;
  return DATA.find((e) => e.ubigeo === ubigeo) ?? null;
}

export type DeteccionUbigeo =
  | { estado: 'encontrado'; entry: UbigeoEntry }
  | { estado: 'ambiguo'; candidatos: UbigeoEntry[] }
  | { estado: 'sin_match' };

// Busca nombres de distrito dentro del texto. Prioriza la coincidencia más específica (más
// palabras: "SAN JUAN DE LURIGANCHO" antes que "LIMA"), porque una dirección formal suele
// mencionar el distrito real antes de repetir la provincia/departamento al final (que muchas
// veces coincide con el nombre de un distrito capital, p. ej. "Lima" o "Huaraz").
export function detectarUbigeo(direccion: string): DeteccionUbigeo {
  const norm = normalizar(direccion);
  if (!norm) return { estado: 'sin_match' };
  const tokens = norm.split(' ');
  const consumido = new Array(tokens.length).fill(false);
  const matches: { nombre: string; index: number; palabras: number }[] = [];

  for (const nombre of nombresDistritoOrdenados) {
    const nombreTokens = nombre.split(' ');
    for (let i = 0; i <= tokens.length - nombreTokens.length; i++) {
      if (consumido.slice(i, i + nombreTokens.length).some(Boolean)) continue;
      let match = true;
      for (let j = 0; j < nombreTokens.length; j++) {
        if (tokens[i + j] !== nombreTokens[j]) { match = false; break; }
      }
      if (!match) continue;
      for (let j = 0; j < nombreTokens.length; j++) consumido[i + j] = true;
      matches.push({ nombre, index: i, palabras: nombreTokens.length });
    }
  }

  if (!matches.length) return { estado: 'sin_match' };
  matches.sort((a, b) => b.palabras - a.palabras || a.index - b.index);
  const mejorMatch = matches[0];

  const candidatos = distritosPorNombre.get(mejorMatch.nombre)!;
  if (candidatos.length === 1) return { estado: 'encontrado', entry: candidatos[0] };

  // Desambiguar por provincia/departamento mencionados en el resto de la dirección
  const filtrados = candidatos.filter(
    (c) => norm.includes(normalizar(c.provincia)) || norm.includes(normalizar(c.departamento))
  );
  if (filtrados.length === 1) return { estado: 'encontrado', entry: filtrados[0] };

  return { estado: 'ambiguo', candidatos: filtrados.length > 0 ? filtrados : candidatos };
}
