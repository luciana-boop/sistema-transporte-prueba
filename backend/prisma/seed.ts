// FILE: prisma/seed.ts

import { PrismaClient, Rol, CondicionPago, EstadoPedido, TipoGasto, EstadoFactura, MetodoPago, EstadoCaja, TipoMovimientoCaja } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de base de datos...');

  // ─── USUARIOS ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 12);
  const secretarioPassword = await bcrypt.hash('secretario123', 12);

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@transportes.com' },
    update: {},
    create: {
      nombre: 'Administrador Principal',
      email: 'admin@transportes.com',
      passwordHash: adminPassword,
      rol: Rol.ADMIN,
      activo: true,
    },
  });

  const secretario = await prisma.usuario.upsert({
    where: { email: 'secretario@transportes.com' },
    update: {},
    create: {
      nombre: 'María García',
      email: 'secretario@transportes.com',
      passwordHash: secretarioPassword,
      rol: Rol.SECRETARIO,
      activo: true,
    },
  });

  console.log('✅ Usuarios creados:', admin.email, secretario.email);

  // ─── CLIENTES ────────────────────────────────────────────────────────────
  const cliente1 = await prisma.cliente.upsert({
    where: { ruc: '20123456789' },
    update: {},
    create: {
      razonSocial: 'Distribuidora Lima S.A.C.',
      ruc: '20123456789',
      direccion: 'Av. Industrial 1234, Lima',
      telefono: '01-2345678',
      email: 'contacto@distribuidoralima.com',
      condicionPago: CondicionPago.CREDITO_30,
    },
  });

  const cliente2 = await prisma.cliente.upsert({
    where: { ruc: '20987654321' },
    update: {},
    create: {
      razonSocial: 'Exportaciones Norte E.I.R.L.',
      ruc: '20987654321',
      direccion: 'Jr. Comercio 567, Trujillo',
      telefono: '044-567890',
      email: 'admin@exportnorte.pe',
      condicionPago: CondicionPago.CREDITO_15,
    },
  });

  const cliente3 = await prisma.cliente.upsert({
    where: { ruc: '10456789012' },
    update: {},
    create: {
      razonSocial: 'Juan Pérez Quispe',
      ruc: '10456789012',
      direccion: 'Calle Los Pinos 89, Arequipa',
      telefono: '054-234567',
      condicionPago: CondicionPago.CONTADO,
    },
  });

  console.log('✅ Clientes creados');

  // ─── PEDIDOS ─────────────────────────────────────────────────────────────
  // Nota: El modelo Pedido no tiene pesoCarga ni fechaEntrega.
  // EstadoPedido solo admite ACTIVO o ANULADO.

  const pedido1 = await prisma.pedido.create({
    data: {
      clienteId: cliente1.id,
      usuarioId: secretario.id,
      origen: 'Lima - Callao',
      destino: 'Trujillo - La Libertad',
      tipoCarga: 'Mercadería general',
      tarifa: 1500.00,
      estado: EstadoPedido.ACTIVO,
      observaciones: 'Entregado el 15/01/2024',
    },
  });

  const pedido2 = await prisma.pedido.create({
    data: {
      clienteId: cliente2.id,
      usuarioId: secretario.id,
      origen: 'Trujillo - La Libertad',
      destino: 'Lima - Miraflores',
      tipoCarga: 'Productos refrigerados',
      tarifa: 2200.00,
      estado: EstadoPedido.ACTIVO,
      observaciones: 'En ruta',
    },
  });

  const pedido3 = await prisma.pedido.create({
    data: {
      clienteId: cliente3.id,
      usuarioId: admin.id,
      origen: 'Arequipa',
      destino: 'Lima - Los Olivos',
      tipoCarga: 'Electrodomésticos',
      tarifa: 900.00,
      estado: EstadoPedido.ACTIVO,
    },
  });

  console.log('✅ Pedidos creados');

  // ─── FACTURAS ────────────────────────────────────────────────────────────
  const factura1 = await prisma.factura.create({
    data: {
      pedidoId: pedido1.id,
      clienteId: cliente1.id,
      usuarioId: secretario.id,
      serie: 'F001',
      correlativo: 1,
      numeroFactura: 'F001-00001',
      subtotal: 1271.19,
      igv: 228.81,
      total: 1500.00,
      estado: EstadoFactura.PAGADA,
      fechaVencimiento: new Date('2024-02-15'),
    },
  });

  await prisma.factura.create({
    data: {
      pedidoId: pedido2.id,
      clienteId: cliente2.id,
      usuarioId: secretario.id,
      serie: 'F001',
      correlativo: 2,
      numeroFactura: 'F001-00002',
      subtotal: 1864.41,
      igv: 335.59,
      total: 2200.00,
      estado: EstadoFactura.EMITIDA,
      fechaVencimiento: new Date('2024-02-28'),
    },
  });

  console.log('✅ Facturas creadas');

  // ─── CAJA ────────────────────────────────────────────────────────────────
  const caja = await prisma.caja.create({
    data: {
      usuarioId: admin.id,
      fecha: new Date(),
      saldoApertura: 500.00,
      estado: EstadoCaja.ABIERTA,
    },
  });

  // ─── PAGOS ───────────────────────────────────────────────────────────────
  const pago1 = await prisma.pago.create({
    data: {
      facturaId: factura1.id,
      clienteId: cliente1.id,
      usuarioId: secretario.id,
      monto: 1500.00,
      metodoPago: MetodoPago.TRANSFERENCIA,
      referencia: 'TRF-2024-001',
      fechaPago: new Date('2024-01-20'),
    },
  });

  await prisma.movimientoCaja.create({
    data: {
      cajaId: caja.id,
      tipo: TipoMovimientoCaja.INGRESO,
      monto: 1500.00,
      concepto: `Cobro factura ${factura1.numeroFactura}`,
      pagoId: pago1.id,
    },
  });

  console.log('✅ Pagos y movimientos de caja creados');

  // ─── GASTOS ──────────────────────────────────────────────────────────────
  await prisma.gasto.createMany({
    data: [
      {
        usuarioId: secretario.id,
        tipoGasto: TipoGasto.COMBUSTIBLE,
        monto: 350.00,
        descripcion: 'Combustible Lima - Trujillo ida y vuelta',
        fecha: new Date('2024-01-14'),
      },
      {
        usuarioId: secretario.id,
        tipoGasto: TipoGasto.PEAJE,
        monto: 85.00,
        descripcion: 'Peajes Panamericana Norte',
        fecha: new Date('2024-01-14'),
      },
      {
        usuarioId: secretario.id,
        tipoGasto: TipoGasto.VIATICOS,
        monto: 120.00,
        descripcion: 'Viáticos conductor 2 días',
        fecha: new Date('2024-01-14'),
      },
    ],
  });

  console.log('✅ Gastos creados');

  // ─── LOG ─────────────────────────────────────────────────────────────────
  await prisma.logActividad.createMany({
    data: [
      {
        usuarioId: admin.id,
        accion: 'SEED',
        modulo: 'SISTEMA',
        detalle: 'Base de datos inicializada con datos de prueba',
      },
    ],
  });

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('🚀 Seed completado exitosamente');
  console.log('');
  console.log('Credenciales de acceso:');
  console.log('  ADMIN:      admin@transportes.com / admin123');
  console.log('  SECRETARIO: secretario@transportes.com / secretario123');
  console.log('══════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
