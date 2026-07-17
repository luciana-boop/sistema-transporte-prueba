// FILE: scripts/importar-datos-iniciales.ts
//
// Importa a la base de datos el Excel de datos iniciales llenado por transportes
// (plantillas/Plantilla_Datos_Iniciales_Transportes.xlsx): hojas Clientes,
// Conductores, Vehículos y Configuración.
//
// Uso:
//   npx ts-node --project tsconfig.seed.json scripts/importar-datos-iniciales.ts <ruta.xlsx>
//   (agregar --commit al final para escribir en la base; sin --commit solo se
//   valida y se muestra un resumen, sin tocar la base de datos)
//
// Convención de la plantilla: fila 1 título, fila 2 encabezados, fila 3 es el
// ejemplo (se ignora siempre), los datos reales empiezan en la fila 4.

import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, TipoVehiculo } from '@prisma/client';

const prisma = new PrismaClient();

const FILA_DATOS_INICIO = 4; // 1-indexado: fila 3 = ejemplo, se salta siempre

interface ErrorFila {
  hoja: string;
  fila: number;
  motivo: string;
}

const errores: ErrorFila[] = [];
const avisos: string[] = [];

function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function leerHoja(wb: XLSX.WorkBook, nombre: string): unknown[][] {
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error(`No se encontró la hoja "${nombre}" en el Excel.`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
}

function mapaColumnas(filaEncabezado: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  filaEncabezado.forEach((celda, idx) => {
    if (typeof celda === 'string' && celda.trim() !== '') {
      m.set(normalizar(celda.replace(/\*/g, '')), idx);
    }
  });
  return m;
}

function col(fila: unknown[], mapa: Map<string, number>, nombre: string): string {
  const idx = mapa.get(normalizar(nombre));
  if (idx === undefined) return '';
  const v = fila[idx];
  return v === undefined || v === null ? '' : String(v).trim();
}

function filaVacia(fila: unknown[]): boolean {
  return !fila || fila.every((c) => c === undefined || c === null || String(c).trim() === '');
}

function parsearFecha(valor: string): Date | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const f = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    return isNaN(f.getTime()) ? null : f;
  }
  const f = new Date(valor);
  return isNaN(f.getTime()) ? null : f;
}

function parsearFechaCelda(celda: unknown): Date | null {
  if (celda instanceof Date) return celda;
  if (typeof celda === 'number') {
    const f = XLSX.SSF.parse_date_code(celda);
    if (!f) return null;
    return new Date(Date.UTC(f.y, f.m - 1, f.d));
  }
  if (typeof celda === 'string') return parsearFecha(celda);
  return null;
}

// Valores del enum antiguo (Cliente.condicionPago era CONTADO/CREDITO_15/30/60);
// se siguen aceptando en la plantilla y se traducen al código nuevo (días).
const CONDICION_PAGO_LEGACY: Record<string, string> = {
  CREDITO_15: '15',
  CREDITO_30: '30',
  CREDITO_60: '60',
};

/** RUC -> id del cliente, para las hojas que dependen de Clientes (Contactos Adicionales). */
async function importarClientes(wb: XLSX.WorkBook, commit: boolean) {
  const filas = leerHoja(wb, 'Clientes');
  const mapa = mapaColumnas(filas[1] ?? []);
  const rucsVistos = new Set<string>();
  const clientesExistentes = await prisma.cliente.findMany({ select: { id: true, ruc: true } });
  const rucsExistentes = new Set(clientesExistentes.map((c) => c.ruc));
  const idPorRuc = new Map<string, number>(clientesExistentes.map((c) => [c.ruc, c.id]));
  const tiposCreditoActivos = await prisma.tablaMaestra.findMany({ where: { tipo: 'tipo_credito', activo: true }, select: { codigo: true } });
  const codigosCreditoValidos = new Set(tiposCreditoActivos.map((t) => t.codigo));

  let creados = 0;
  for (let i = FILA_DATOS_INICIO - 1; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    const numFila = i + 1;

    const razonSocial = col(fila, mapa, 'Razón Social');
    const ruc = col(fila, mapa, 'RUC');
    const direccion = col(fila, mapa, 'Dirección');
    const ubigeo = col(fila, mapa, 'Ubigeo') || undefined;
    const telefono = col(fila, mapa, 'Teléfono') || undefined;
    const email = col(fila, mapa, 'Email') || undefined;
    const condicionRaw = col(fila, mapa, 'Condición de Pago').toUpperCase();

    if (!razonSocial || !ruc || !direccion) {
      errores.push({ hoja: 'Clientes', fila: numFila, motivo: 'Faltan campos obligatorios (Razón Social, RUC o Dirección)' });
      continue;
    }
    if (!/^\d{11}$/.test(ruc)) {
      errores.push({ hoja: 'Clientes', fila: numFila, motivo: `RUC "${ruc}" no tiene 11 dígitos` });
      continue;
    }
    if (rucsVistos.has(ruc) || rucsExistentes.has(ruc)) {
      errores.push({ hoja: 'Clientes', fila: numFila, motivo: `RUC "${ruc}" duplicado (ya existe en el archivo o en la base de datos)` });
      continue;
    }
    let condicionPago = 'CONTADO';
    if (condicionRaw) {
      const codigo = CONDICION_PAGO_LEGACY[condicionRaw] ?? condicionRaw;
      if (codigo !== 'CONTADO' && !codigosCreditoValidos.has(codigo)) {
        const opciones = ['CONTADO', ...Array.from(codigosCreditoValidos)].join(', ');
        errores.push({ hoja: 'Clientes', fila: numFila, motivo: `Condición de Pago "${condicionRaw}" inválida (usar ${opciones})` });
        continue;
      }
      condicionPago = codigo;
    }

    rucsVistos.add(ruc);
    if (commit) {
      const creado = await prisma.cliente.create({ data: { razonSocial, ruc, direccion, ubigeo, telefono, email, condicionPago } });
      idPorRuc.set(ruc, creado.id);
    } else {
      idPorRuc.set(ruc, -1); // marcador: en modo validación no hay id real, pero el RUC es válido
    }
    creados++;
  }
  return { creados, idPorRuc };
}

async function importarContactosAdicionales(wb: XLSX.WorkBook, commit: boolean, idPorRuc: Map<string, number>) {
  const filas = leerHoja(wb, 'Contactos Adicionales');
  const mapa = mapaColumnas(filas[1] ?? []);

  let creados = 0;
  for (let i = FILA_DATOS_INICIO - 1; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    const numFila = i + 1;

    const ruc = col(fila, mapa, 'RUC del Cliente');
    const nombre = col(fila, mapa, 'Nombre del Contacto');
    const telefono = col(fila, mapa, 'Teléfono') || undefined;
    const email = col(fila, mapa, 'Email') || undefined;

    if (!ruc || !nombre) {
      errores.push({ hoja: 'Contactos Adicionales', fila: numFila, motivo: 'Faltan campos obligatorios (RUC del Cliente o Nombre del Contacto)' });
      continue;
    }
    const clienteId = idPorRuc.get(ruc);
    if (clienteId === undefined) {
      errores.push({ hoja: 'Contactos Adicionales', fila: numFila, motivo: `RUC "${ruc}" no existe en la hoja Clientes ni en la base de datos` });
      continue;
    }

    if (commit) {
      await prisma.clienteContacto.create({ data: { clienteId, nombre, telefono, email } });
    }
    creados++;
  }
  return creados;
}

async function importarConductores(wb: XLSX.WorkBook, commit: boolean) {
  const filas = leerHoja(wb, 'Conductores');
  const mapa = mapaColumnas(filas[1] ?? []);
  const dnisVistos = new Set<string>();
  const dnisExistentes = new Set((await prisma.conductor.findMany({ select: { dni: true } })).map((c) => c.dni));

  let creados = 0;
  for (let i = FILA_DATOS_INICIO - 1; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    const numFila = i + 1;

    const nombre = col(fila, mapa, 'Nombre completo');
    const dni = col(fila, mapa, 'DNI');
    const licencia = col(fila, mapa, 'N° Licencia');
    const vencIdx = mapa.get(normalizar('Vencimiento Licencia'));
    const vencimientoLicencia = vencIdx !== undefined ? parsearFechaCelda(fila[vencIdx]) : null;
    const telefono = col(fila, mapa, 'Teléfono') || undefined;
    const direccion = col(fila, mapa, 'Dirección') || undefined;
    const tractoPreferencia = col(fila, mapa, 'Tracto Preferido (Placa)') || undefined;
    const carretaPreferencia = col(fila, mapa, 'Carreta Preferida (Placa)') || undefined;
    const observaciones = col(fila, mapa, 'Observaciones') || undefined;

    if (!nombre || !dni || !licencia || !vencimientoLicencia) {
      errores.push({ hoja: 'Conductores', fila: numFila, motivo: 'Faltan campos obligatorios (Nombre, DNI, N° Licencia o Vencimiento Licencia inválido/faltante)' });
      continue;
    }
    if (!/^\d{8}$/.test(dni)) {
      errores.push({ hoja: 'Conductores', fila: numFila, motivo: `DNI "${dni}" no tiene 8 dígitos` });
      continue;
    }
    if (dnisVistos.has(dni) || dnisExistentes.has(dni)) {
      errores.push({ hoja: 'Conductores', fila: numFila, motivo: `DNI "${dni}" duplicado (ya existe en el archivo o en la base de datos)` });
      continue;
    }

    dnisVistos.add(dni);
    if (commit) {
      await prisma.conductor.create({
        data: { nombre, dni, licencia, vencimientoLicencia, telefono, direccion, tractoPreferencia, carretaPreferencia, observaciones },
      });
    }
    creados++;
  }
  return creados;
}

async function importarVehiculos(wb: XLSX.WorkBook, commit: boolean) {
  const filas = leerHoja(wb, 'Vehículos');
  const mapa = mapaColumnas(filas[1] ?? []);
  const placasVistas = new Set<string>();
  const placasExistentes = new Set((await prisma.vehiculo.findMany({ select: { placa: true } })).map((v) => v.placa));

  let creados = 0;
  for (let i = FILA_DATOS_INICIO - 1; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    const numFila = i + 1;

    const placa = col(fila, mapa, 'Placa').toUpperCase();
    const tipoRaw = col(fila, mapa, 'Tipo').toUpperCase();
    const marca = col(fila, mapa, 'Marca');
    const modelo = col(fila, mapa, 'Modelo');
    const anioRaw = col(fila, mapa, 'Año');
    const soat = col(fila, mapa, 'N° SOAT') || undefined;
    const vencSoatIdx = mapa.get(normalizar('Vencimiento SOAT'));
    const vencimientoSoat = vencSoatIdx !== undefined ? parsearFechaCelda(fila[vencSoatIdx]) : null;
    const revisionTecnica = col(fila, mapa, 'N° Revisión Técnica') || undefined;
    const vencRevIdx = mapa.get(normalizar('Vencimiento Revisión Técnica'));
    const vencimientoRevision = vencRevIdx !== undefined ? parsearFechaCelda(fila[vencRevIdx]) : null;
    const estadoRaw = col(fila, mapa, 'Estado').toUpperCase();
    const observaciones = col(fila, mapa, 'Observaciones') || undefined;

    if (!placa || !tipoRaw || !marca || !modelo || !anioRaw) {
      errores.push({ hoja: 'Vehículos', fila: numFila, motivo: 'Faltan campos obligatorios (Placa, Tipo, Marca, Modelo o Año)' });
      continue;
    }
    if (!(tipoRaw in TipoVehiculo)) {
      errores.push({ hoja: 'Vehículos', fila: numFila, motivo: `Tipo "${tipoRaw}" inválido (usar TRACTO o CARRETA)` });
      continue;
    }
    const anio = Number(anioRaw);
    if (!Number.isInteger(anio) || anio < 1980 || anio > new Date().getFullYear() + 1) {
      errores.push({ hoja: 'Vehículos', fila: numFila, motivo: `Año "${anioRaw}" inválido` });
      continue;
    }
    if (placasVistas.has(placa) || placasExistentes.has(placa)) {
      errores.push({ hoja: 'Vehículos', fila: numFila, motivo: `Placa "${placa}" duplicada (ya existe en el archivo o en la base de datos)` });
      continue;
    }
    const estado = ['OPERATIVO', 'MANTENIMIENTO', 'INACTIVO'].includes(estadoRaw) ? estadoRaw : 'OPERATIVO';

    placasVistas.add(placa);
    if (commit) {
      await prisma.vehiculo.create({
        data: {
          placa, tipo: TipoVehiculo[tipoRaw as keyof typeof TipoVehiculo], marca, modelo, anio,
          soat, vencimientoSoat, revisionTecnica, vencimientoRevision, estado, observaciones,
        },
      });
    }
    creados++;
  }
  return creados;
}

const CONFIG_CLAVES: Record<string, { clave: string; tipo: string; categoria: string; etiqueta: string }> = {
  'nombre / razon social de la empresa': { clave: 'empresa_nombre', tipo: 'texto', categoria: 'empresa', etiqueta: 'Nombre de la empresa' },
  'ruc de la empresa': { clave: 'empresa_ruc', tipo: 'texto', categoria: 'empresa', etiqueta: 'RUC' },
  'direccion de la empresa': { clave: 'empresa_direccion', tipo: 'texto', categoria: 'empresa', etiqueta: 'Dirección' },
  'telefono de la empresa': { clave: 'empresa_telefono', tipo: 'texto', categoria: 'empresa', etiqueta: 'Teléfono' },
  'porcentaje de igv': { clave: 'igv_porcentaje', tipo: 'numero', categoria: 'facturacion', etiqueta: 'Porcentaje IGV' },
  'moneda por defecto': { clave: 'moneda_default', tipo: 'texto', categoria: 'facturacion', etiqueta: 'Moneda por defecto' },
};

async function importarConfiguracion(wb: XLSX.WorkBook, commit: boolean) {
  const filas = leerHoja(wb, 'Configuración');
  let actualizados = 0;
  for (let i = 2; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    const etiquetaCelda = String(fila[0] ?? '').trim();
    if (!etiquetaCelda || etiquetaCelda.startsWith('(')) continue; // fila de "(ejemplo)"
    const clave = normalizar(etiquetaCelda.replace(/\*/g, ''));
    const def = CONFIG_CLAVES[clave];
    if (!def) continue; // fila de notas u otra cosa que no reconocemos
    const valor = String(fila[1] ?? '').trim();
    if (!valor) {
      avisos.push(`Configuración: "${etiquetaCelda}" está vacío, se omite (se mantiene el valor actual en la base de datos).`);
      continue;
    }
    if (commit) {
      await prisma.configuracion.upsert({
        where: { clave: def.clave },
        update: { valor },
        create: { ...def, valor },
      });
    }
    actualizados++;
  }
  return actualizados;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const rutaArg = args.find((a) => !a.startsWith('--'));
  const ruta = rutaArg
    ? path.resolve(process.cwd(), rutaArg)
    : path.resolve(__dirname, '..', '..', 'plantillas', 'Plantilla_Datos_Iniciales_Transportes.xlsx');

  console.log(`📄 Leyendo: ${ruta}`);
  const wb = XLSX.readFile(ruta, { cellDates: true });

  const { creados: nCli, idPorRuc } = await importarClientes(wb, commit);
  const nCont = await importarContactosAdicionales(wb, commit, idPorRuc);
  const nCon = await importarConductores(wb, commit);
  const nVeh = await importarVehiculos(wb, commit);
  const nCfg = await importarConfiguracion(wb, commit);

  console.log('\n── RESUMEN ──────────────────────────────');
  console.log(`Clientes ${commit ? 'creados' : 'a crear'}:      ${nCli}`);
  console.log(`Contactos adicionales ${commit ? 'creados' : 'a crear'}: ${nCont}`);
  console.log(`Conductores ${commit ? 'creados' : 'a crear'}:   ${nCon}`);
  console.log(`Vehículos ${commit ? 'creados' : 'a crear'}:     ${nVeh}`);
  console.log(`Config. ${commit ? 'actualizadas' : 'a actualizar'}: ${nCfg}`);

  if (avisos.length) {
    console.log(`\n⚠️  Avisos (${avisos.length}):`);
    avisos.forEach((a) => console.log(`  - ${a}`));
  }

  if (errores.length) {
    console.log(`\n❌ Filas con error, NO se importaron (${errores.length}):`);
    errores.forEach((e) => console.log(`  - [${e.hoja}] fila ${e.fila}: ${e.motivo}`));
  }

  if (!commit) {
    console.log('\nEsto fue solo una VALIDACIÓN, no se escribió nada en la base de datos.');
    console.log('Si el resumen se ve bien, vuelve a correr el script agregando --commit al final.');
  } else {
    console.log('\n✅ Datos importados a la base de datos.');
  }
}

main()
  .catch((e) => {
    console.error('Error inesperado:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
