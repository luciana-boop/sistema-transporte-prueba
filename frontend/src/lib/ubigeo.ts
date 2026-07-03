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

// Busca el nombre de distrito más específico (más palabras: "SAN JUAN DE LURIGANCHO" antes que
// "LIMA") dentro de un texto ya normalizado. Entre coincidencias de igual especificidad gana la
// más a la izquierda, porque la convención peruana ordena "distrito, provincia, departamento"
// (el departamento, al final, suele coincidir con el nombre de un distrito capital).
function buscarNombreDistrito(norm: string): string | null {
  const tokens = norm.split(' ').filter(Boolean);
  if (!tokens.length) return null;
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

  if (!matches.length) return null;
  matches.sort((a, b) => b.palabras - a.palabras || a.index - b.index);
  return matches[0].nombre;
}

// Palabras que delatan el tramo de "calle" de la dirección (tiene número, o un tipo de vía).
// Una avenida puede llamarse igual que un distrito (p. ej. "Av. Arequipa"), así que ese tramo se
// descarta de la búsqueda cuando es identificable, y el distrito/provincia/departamento casi
// siempre queda al final de la dirección.
const PALABRAS_CALLE = new Set([
  'AV', 'AVENIDA', 'JR', 'JIRON', 'CALLE', 'CAL', 'CA', 'PSJE', 'PASAJE', 'MZ', 'MZA', 'MANZANA',
  'LOTE', 'LT', 'URB', 'URBANIZACION', 'PROL', 'PROLONGACION', 'NRO', 'KM', 'ASOC', 'AAHH', 'COOP',
]);
function pareceTramoDeCalle(segmentoNorm: string): boolean {
  if (/[0-9]/.test(segmentoNorm)) return true;
  return segmentoNorm.split(' ').some((t) => PALABRAS_CALLE.has(t));
}

export function detectarUbigeo(direccion: string): DeteccionUbigeo {
  const norm = normalizar(direccion);
  if (!norm) return { estado: 'sin_match' };

  // Zona de búsqueda: recorta el tramo de calle (antes de la primera coma, o hasta el último
  // número si no hay comas) cuando es identificable, para no confundir avenidas con distritos.
  let zona = norm;
  const idxComa = direccion.indexOf(',');
  if (idxComa >= 0) {
    const primerSegmento = normalizar(direccion.slice(0, idxComa));
    if (pareceTramoDeCalle(primerSegmento)) zona = normalizar(direccion.slice(idxComa + 1));
  } else if (pareceTramoDeCalle(norm)) {
    const tokens = norm.split(' ');
    let ultimoNumIdx = -1;
    tokens.forEach((t, i) => { if (/^[0-9]+$/.test(t)) ultimoNumIdx = i; });
    if (ultimoNumIdx >= 0 && ultimoNumIdx < tokens.length - 1) {
      zona = tokens.slice(ultimoNumIdx + 1).join(' ');
    }
  }

  const nombre = buscarNombreDistrito(zona) ?? buscarNombreDistrito(norm);
  if (!nombre) return { estado: 'sin_match' };

  const candidatos = distritosPorNombre.get(nombre)!;
  if (candidatos.length === 1) return { estado: 'encontrado', entry: candidatos[0] };

  // Desambiguar por provincia/departamento mencionados en el resto de la dirección
  const filtrados = candidatos.filter(
    (c) => norm.includes(normalizar(c.provincia)) || norm.includes(normalizar(c.departamento))
  );
  if (filtrados.length === 1) return { estado: 'encontrado', entry: filtrados[0] };

  return { estado: 'ambiguo', candidatos: filtrados.length > 0 ? filtrados : candidatos };
}
