// FILE: scripts/importar-deudas-salvador.ts
//
// Importa a la base de datos las facturas históricas de deuda (Excel de
// control manual "deudassalvador.xlsx", hoja DATOS) junto con las cobranzas
// (abonos) ya registradas, para dejar el sistema con el mismo saldo por
// cobrar que el Excel.
//
// Reglas aplicadas (indicadas por el usuario):
//  - Se ignoran las filas marcadas como ANULADO (columna CLIENTE = "ANULADO").
//  - El "Total" de la factura en el sistema es MONTO - DETRACCION (la
//    detracción no se cobra al cliente, Cobranza debe mostrar el saldo neto).
//  - Cada abono (columnas FECHA DE ABONO / MONTO / N° OPERACIÓN, hasta 2 por
//    factura) se registra como cobranza (PagoV2 + aplicación) sobre esa factura.
//  - El campo "detalle" de la factura queda vacío (no es obligatorio en el sistema).
//  - Cliente "SOLUCIONES" no existe en el sistema: se crea con datos mínimos.
//
// Uso:
//   npx ts-node --project tsconfig.seed.json scripts/importar-deudas-salvador.ts <ruta.xlsx>
//   (agregar --commit al final para escribir en la base; sin --commit solo
//   valida y muestra un resumen, sin tocar la base de datos)

import * as XLSX from 'xlsx';
import { PrismaClient, EstadoFactura } from '@prisma/client';

const prisma = new PrismaClient();

const HOJA = 'DATOS';
const FILA_DATOS_INICIO = 3;

// Nombre simplificado (Excel) -> RUC real en el sistema
const RUC_POR_NOMBRE: Record<string, string> = {
  ICATOM: '20310422755',
  BODEGA: '20503644968',
  'SOL DE ICA': '20517780732',
  UNACEM: '20608552171',
  'JM FER': '20611087935',
  'JM GREEN': '20601039291',
  ACEROS: '20370146994',
};
const RUC_SOLUCIONES = 'PENDIENTE-SOLUCIONES';

const USUARIO_ID = 1; // Luciana (ADMIN) — confirmado por el usuario
const MONEDA_ID = 1; // PEN

interface FilaPago {
  fecha: Date;
  monto: number;
  referencia: string | null;
}

interface FilaFactura {
  fila: number;
  clienteNombre: string;
  numeroFactura: string;
  serie: string;
  correlativo: number;
  guiaReferencia: string | null;
  diasCredito: number;
  fechaEmision: Date;
  fechaVencimiento: Date;
  montoBruto: number;
  montoDetraccion: number;
  total: number;
  pagos: FilaPago[];
  totalPagado: number;
  estado: EstadoFactura;
}

const errores: string[] = [];
const avisos: string[] = [];

function celda(ws: XLSX.WorkSheet, col: string, fila: number): any {
  const c = ws[`${col}${fila}`];
  return c ? c.v : undefined;
}

function fechaCelda(ws: XLSX.WorkSheet, col: string, fila: number): Date | null {
  const v = celda(ws, col, fila);
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    const f = XLSX.SSF.parse_date_code(v);
    if (!f) return null;
    return new Date(Date.UTC(f.y, f.m - 1, f.d));
  }
  return null;
}

function texto(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

function numero(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function main() {
  const rutaArchivo = process.argv[2];
  const commit = process.argv.includes('--commit');
  if (!rutaArchivo) {
    console.error('Uso: ts-node scripts/importar-deudas-salvador.ts <ruta.xlsx> [--commit]');
    process.exit(1);
  }

  const wb = XLSX.readFile(rutaArchivo, { cellDates: true });
  const ws = wb.Sheets[HOJA];
  if (!ws) throw new Error(`No se encontró la hoja "${HOJA}"`);
  const range = XLSX.utils.decode_range(ws['!ref']!);
  const ultimaFila = range.e.r + 1; // 1-indexado

  // ── Clientes ────────────────────────────────────────────────────────────
  const clientesDb = await prisma.cliente.findMany({ select: { id: true, ruc: true } });
  const idPorRuc = new Map(clientesDb.map((c) => [c.ruc, c.id]));

  let clienteSolucionesId = idPorRuc.get(RUC_SOLUCIONES);
  if (!clienteSolucionesId) {
    if (commit) {
      const creado = await prisma.cliente.create({
        data: {
          razonSocial: 'SOLUCIONES',
          ruc: RUC_SOLUCIONES,
          direccion: 'Por completar',
          condicionPago: 'CONTADO',
          creadoPorId: USUARIO_ID,
        },
      });
      clienteSolucionesId = creado.id;
      idPorRuc.set(RUC_SOLUCIONES, creado.id);
      avisos.push(`Cliente "SOLUCIONES" creado con datos mínimos (id=${creado.id}). Completar razón social/RUC/dirección reales después.`);
    } else {
      clienteSolucionesId = -1; // marcador para el resumen en modo validación
      avisos.push('Cliente "SOLUCIONES" no existe: se creará con datos mínimos al correr con --commit.');
    }
  }

  function idClientePorNombre(nombre: string): number | undefined {
    if (nombre === 'SOLUCIONES') return clienteSolucionesId;
    const ruc = RUC_POR_NOMBRE[nombre];
    if (!ruc) return undefined;
    return idPorRuc.get(ruc);
  }

  // ── Facturas ya existentes (para poder re-correr el script sin duplicar) ──
  const facturasExistentes = await prisma.factura.findMany({ select: { numeroFactura: true } });
  const numerosExistentes = new Set(facturasExistentes.map((f) => f.numeroFactura));

  const filasFactura: FilaFactura[] = [];
  let anuladas = 0;

  for (let fila = FILA_DATOS_INICIO; fila <= ultimaFila; fila++) {
    const clienteRaw = texto(celda(ws, 'C', fila));
    const numFacRaw = texto(celda(ws, 'D', fila));
    if (!clienteRaw && !numFacRaw) continue; // fila totalmente vacía

    if (clienteRaw && clienteRaw.toUpperCase() === 'ANULADO') {
      anuladas++;
      continue;
    }

    if (!clienteRaw || !numFacRaw) {
      errores.push(`Fila ${fila}: falta cliente o número de factura`);
      continue;
    }

    const numeroFactura = numFacRaw.replace(/\s+/g, '');
    const partes = numeroFactura.split('-');
    if (partes.length !== 2 || !/^\d+$/.test(partes[1])) {
      errores.push(`Fila ${fila}: número de factura "${numeroFactura}" no tiene el formato SERIE-CORRELATIVO`);
      continue;
    }
    const serie = partes[0];
    const correlativo = parseInt(partes[1], 10);

    if (numerosExistentes.has(numeroFactura)) {
      avisos.push(`Fila ${fila}: la factura ${numeroFactura} ya existe en la base de datos, se omite`);
      continue;
    }

    const clienteId = idClientePorNombre(clienteRaw);
    if (!clienteId) {
      errores.push(`Fila ${fila}: cliente "${clienteRaw}" no se pudo asociar a ningún cliente del sistema`);
      continue;
    }

    const fechaEmision = fechaCelda(ws, 'B', fila);
    const fechaVencimiento = fechaCelda(ws, 'G', fila);
    const diasCredito = numero(celda(ws, 'F', fila));
    const montoBruto = numero(celda(ws, 'H', fila));
    const montoDetraccionRaw = numero(celda(ws, 'I', fila));
    const totalExcel = numero(celda(ws, 'J', fila));
    const guiaReferencia = texto(celda(ws, 'E', fila));

    if (!fechaEmision || !fechaVencimiento || diasCredito === null || montoBruto === null || totalExcel === null) {
      errores.push(`Fila ${fila} (${numeroFactura}): faltan datos numéricos/fecha obligatorios`);
      continue;
    }

    const montoDetraccion = montoDetraccionRaw ?? 0;
    const totalCalculado = Math.round((montoBruto - montoDetraccion) * 100) / 100;
    if (Math.abs(totalCalculado - totalExcel) > 0.02) {
      avisos.push(`Fila ${fila} (${numeroFactura}): TOTAL FACTURA del Excel (${totalExcel}) no coincide con MONTO-DETRACCION (${totalCalculado}); se usa el valor del Excel`);
    }
    const total = totalExcel;

    const pagos: FilaPago[] = [];
    const f1 = fechaCelda(ws, 'L', fila);
    const m1 = numero(celda(ws, 'M', fila));
    const n1 = texto(celda(ws, 'N', fila));
    if (m1 !== null && m1 !== 0) pagos.push({ fecha: f1 ?? fechaEmision, monto: m1, referencia: n1 });

    const f2 = fechaCelda(ws, 'O', fila);
    const m2 = numero(celda(ws, 'P', fila));
    const n2 = texto(celda(ws, 'Q', fila));
    if (m2 !== null && m2 !== 0) pagos.push({ fecha: f2 ?? fechaEmision, monto: m2, referencia: n2 });

    const totalPagado = Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100;
    let estado: EstadoFactura;
    if (totalPagado <= 0) estado = EstadoFactura.EMITIDA;
    else if (Math.abs(totalPagado - total) < 0.02 || totalPagado >= total) estado = EstadoFactura.PAGADA;
    else estado = EstadoFactura.PARCIAL;

    filasFactura.push({
      fila, clienteNombre: clienteRaw, numeroFactura, serie, correlativo,
      guiaReferencia, diasCredito, fechaEmision, fechaVencimiento,
      montoBruto, montoDetraccion, total, pagos, totalPagado, estado,
    });
  }

  // ── Resumen ─────────────────────────────────────────────────────────────
  const porCliente = new Map<string, { n: number; bruto: number; detraccion: number; total: number; pagado: number; saldo: number }>();
  for (const f of filasFactura) {
    const acc = porCliente.get(f.clienteNombre) ?? { n: 0, bruto: 0, detraccion: 0, total: 0, pagado: 0, saldo: 0 };
    acc.n++;
    acc.bruto += f.montoBruto;
    acc.detraccion += f.montoDetraccion;
    acc.total += f.total;
    acc.pagado += f.totalPagado;
    acc.saldo += f.total - f.totalPagado;
    porCliente.set(f.clienteNombre, acc);
  }

  console.log(`\n=== RESUMEN (${commit ? 'COMMIT' : 'VALIDACIÓN — no se escribió nada'}) ===`);
  console.log(`Filas ANULADO ignoradas: ${anuladas}`);
  console.log(`Facturas a crear: ${filasFactura.length}`);
  console.log('\nPor cliente (n | bruto | detracción | total neto | pagado | saldo por cobrar):');
  let totalSaldo = 0;
  for (const [nombre, acc] of porCliente) {
    console.log(
      `  ${nombre.padEnd(12)} n=${String(acc.n).padStart(4)}  bruto=${acc.bruto.toFixed(2).padStart(12)}  detraccion=${acc.detraccion.toFixed(2).padStart(10)}  total=${acc.total.toFixed(2).padStart(12)}  pagado=${acc.pagado.toFixed(2).padStart(12)}  saldo=${acc.saldo.toFixed(2).padStart(12)}`
    );
    totalSaldo += acc.saldo;
  }
  console.log(`\nTOTAL GENERAL SALDO POR COBRAR: ${totalSaldo.toFixed(2)}`);

  if (avisos.length) {
    console.log(`\n=== AVISOS (${avisos.length}) ===`);
    avisos.forEach((a) => console.log('  - ' + a));
  }
  if (errores.length) {
    console.log(`\n=== ERRORES (${errores.length}) — estas filas NO se importan ===`);
    errores.forEach((e) => console.log('  - ' + e));
  }

  if (!commit) {
    console.log('\nModo validación: no se escribió nada en la base de datos. Ejecutar con --commit para aplicar.');
    return;
  }

  // ── Escritura ───────────────────────────────────────────────────────────
  let creadas = 0;
  for (const f of filasFactura) {
    const clienteId = idClientePorNombre(f.clienteNombre)!;
    await prisma.$transaction(async (tx) => {
      const subtotal = Math.round((f.total / 1.18) * 100) / 100;
      const igv = Math.round((f.total - subtotal) * 100) / 100;

      const factura = await tx.factura.create({
        data: {
          clienteId,
          usuarioId: USUARIO_ID,
          serie: f.serie,
          correlativo: f.correlativo,
          numeroFactura: f.numeroFactura,
          subtotal,
          porcentajeIgv: 18,
          igv,
          total: f.total,
          detraccion: f.montoDetraccion > 0 ? f.montoDetraccion : null,
          montoDetraccion: f.montoDetraccion > 0 ? f.montoDetraccion : null,
          porcentajeDetraccion: f.montoDetraccion > 0 ? Math.round((f.montoDetraccion / f.montoBruto) * 10000) / 100 : null,
          tipoCredito: String(f.diasCredito),
          diasCredito: f.diasCredito,
          guiaReferencia: f.guiaReferencia ?? undefined,
          detalle: null,
          estado: f.estado,
          fechaEmision: f.fechaEmision,
          fechaVencimiento: f.fechaVencimiento,
          totalPagado: f.totalPagado,
          creadoPorId: USUARIO_ID,
        },
      });

      for (const p of f.pagos) {
        const pago = await tx.pagoV2.create({
          data: {
            facturaId: factura.id,
            clienteId,
            usuarioId: USUARIO_ID,
            monto: p.monto,
            monedaId: MONEDA_ID,
            referencia: p.referencia ?? undefined,
            fechaPago: p.fecha,
            creadoPorId: USUARIO_ID,
          },
        });
        await tx.pagoV2AplicacionFactura.create({
          data: { pagoId: pago.id, facturaId: factura.id, monto: p.monto, creadoPorId: USUARIO_ID },
        });
      }
    });
    creadas++;
  }

  console.log(`\n${creadas} facturas importadas correctamente.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
