// FILE: scripts/ajustar-saldos-bcp-2026-07.ts
//
// Ajuste puntual pedido por la usuaria (2026-07-21/22) sobre la importación
// bancaria de BCP Soles y BCP Dólares:
//
//  1) Recategoriza a "Otros"/"Otro" los movimientos importados por Excel
//     (22-ene al 20-jul-2026) que quedaron sin categoría, para que aparezcan
//     en los reportes. No toca movimientos que ya tengan categoría.
//  2) Ajusta el saldoInicial de BCP Soles y BCP Dólares (NO crea movimientos
//     nuevos de ingreso) para que el saldo calculado (saldoInicial + ingresos
//     - egresos) coincida con el saldo real del banco al 20-jul-2026:
//       BCP Soles:    S/ 47,866.75
//       BCP Dólares:  $   8.62
//     BCP Soles solo tiene egresos importados (no se bajó el Excel de
//     ingresos porque esa plata ya está registrada como cobrado en Cobranza,
//     sin vínculo a ninguna cuenta) — por eso el saldo calculado sin este
//     ajuste queda muy negativo. El saldoInicial absorbe todo lo anterior a
//     esta importación (incluyendo esos cobros).
//
// Uso:
//   npx ts-node --project tsconfig.seed.json scripts/ajustar-saldos-bcp-2026-07.ts
//   (agregar --commit al final para escribir en la base; sin --commit solo
//   muestra qué haría, sin tocar la base de datos)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DESDE = new Date('2026-01-22T00:00:00');
const HASTA = new Date('2026-07-20T23:59:59');

const CUENTA_SOLES_ID = 2; // BCP SOLES
const CUENTA_DOLARES_ID = 4; // BCP DOLARES
const SALDO_REAL_SOLES = 47866.75;
const SALDO_REAL_DOLARES = 8.62;

const COMMIT = process.argv.includes('--commit');

async function calcularSaldoInicialNuevo(cuentaId: number, saldoRealObjetivo: number) {
  const [ingresos, egresos] = await Promise.all([
    prisma.movimientoCuentaV2.aggregate({ where: { cuentaId, tipo: 'INGRESO', anulado: false }, _sum: { monto: true } }),
    prisma.movimientoCuentaV2.aggregate({ where: { cuentaId, tipo: 'EGRESO', anulado: false }, _sum: { monto: true } }),
  ]);
  const totalIngresos = Number(ingresos._sum.monto || 0);
  const totalEgresos = Number(egresos._sum.monto || 0);
  const saldoInicialNuevo = Math.round((saldoRealObjetivo - (totalIngresos - totalEgresos)) * 100) / 100;
  return { totalIngresos, totalEgresos, saldoInicialNuevo };
}

async function main() {
  console.log(`Modo: ${COMMIT ? 'COMMIT (va a escribir en la base)' : 'DRY-RUN (solo muestra, no escribe)'}\n`);

  // ── 1) Recategorización ────────────────────────────────────────────────
  const whereEgresoSinCategoria = (cuentaId: number) => ({
    cuentaId, tipo: 'EGRESO' as const, categoriaEgreso: null, origen: 'EXCEL', anulado: false,
    fecha: { gte: DESDE, lte: HASTA },
  });
  const whereIngresoSinCategoria = (cuentaId: number) => ({
    cuentaId, tipo: 'INGRESO' as const, categoriaIngreso: null, origen: 'EXCEL', anulado: false,
    fecha: { gte: DESDE, lte: HASTA },
  });

  const [egresosSolesN, egresosDolaresN, ingresosDolaresN] = await Promise.all([
    prisma.movimientoCuentaV2.count({ where: whereEgresoSinCategoria(CUENTA_SOLES_ID) }),
    prisma.movimientoCuentaV2.count({ where: whereEgresoSinCategoria(CUENTA_DOLARES_ID) }),
    prisma.movimientoCuentaV2.count({ where: whereIngresoSinCategoria(CUENTA_DOLARES_ID) }),
  ]);

  console.log('── Recategorización a Otros/Otro (sin categoría, importados por Excel, 22-ene..20-jul-2026) ──');
  console.log(`  BCP Soles   | EGRESO  sin categoría: ${egresosSolesN}`);
  console.log(`  BCP Dólares | EGRESO  sin categoría: ${egresosDolaresN}`);
  console.log(`  BCP Dólares | INGRESO sin categoría: ${ingresosDolaresN}`);

  // ── 2) Saldos reales ────────────────────────────────────────────────────
  const soles = await calcularSaldoInicialNuevo(CUENTA_SOLES_ID, SALDO_REAL_SOLES);
  const dolares = await calcularSaldoInicialNuevo(CUENTA_DOLARES_ID, SALDO_REAL_DOLARES);

  console.log('\n── Ajuste de saldo (sin crear movimientos nuevos) ──');
  console.log(`  BCP Soles   | ingresos: ${soles.totalIngresos.toFixed(2)} | egresos: ${soles.totalEgresos.toFixed(2)} | saldoInicial nuevo: ${soles.saldoInicialNuevo.toFixed(2)} | saldoActual resultante: ${SALDO_REAL_SOLES.toFixed(2)}`);
  console.log(`  BCP Dólares | ingresos: ${dolares.totalIngresos.toFixed(2)} | egresos: ${dolares.totalEgresos.toFixed(2)} | saldoInicial nuevo: ${dolares.saldoInicialNuevo.toFixed(2)} | saldoActual resultante: ${SALDO_REAL_DOLARES.toFixed(2)}`);

  if (!COMMIT) {
    console.log('\nDRY-RUN: no se escribió nada. Vuelve a correr con --commit para aplicar.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.movimientoCuentaV2.updateMany({ where: whereEgresoSinCategoria(CUENTA_SOLES_ID), data: { categoriaEgreso: 'OTROS' } });
    await tx.movimientoCuentaV2.updateMany({ where: whereEgresoSinCategoria(CUENTA_DOLARES_ID), data: { categoriaEgreso: 'OTROS' } });
    await tx.movimientoCuentaV2.updateMany({ where: whereIngresoSinCategoria(CUENTA_DOLARES_ID), data: { categoriaIngreso: 'OTRO' } });

    await tx.cuentaDinero.update({
      where: { id: CUENTA_SOLES_ID },
      data: { saldoInicial: soles.saldoInicialNuevo, saldoActual: SALDO_REAL_SOLES },
    });
    await tx.cuentaDinero.update({
      where: { id: CUENTA_DOLARES_ID },
      data: { saldoInicial: dolares.saldoInicialNuevo, saldoActual: SALDO_REAL_DOLARES },
    });
  });

  console.log('\nCOMMIT: cambios aplicados.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
