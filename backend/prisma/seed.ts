// FILE: prisma/seed.ts

import {
  PrismaClient, Rol, EstadoPedido, EstadoFactura,
  EstadoCaja, TipoMovimientoCaja, TipoVehiculo, CategoriaDetalle,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function igv(total: number) {
  const subtotal = Math.round((total / 1.18) * 100) / 100;
  const igvAmt = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, igv: igvAmt, total };
}

async function main() {
  console.log('🌱 Iniciando seed...');

  // ── LIMPIEZA (orden inverso de FK) ────────────────────────────────────────
  await prisma.logActividad.deleteMany();
  await prisma.liquidacionPedido.deleteMany();
  await prisma.liquidacionDetalle.deleteMany();
  await prisma.movimientoCaja.deleteMany();
  await prisma.combustible.deleteMany();
  await prisma.liquidacion.deleteMany();
  await prisma.facturaDetalle.deleteMany();
  await prisma.factura.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.caja.deleteMany();
  console.log('🧹 Datos transaccionales limpiados');

  // ── USUARIOS (4) ──────────────────────────────────────────────────────────
  const [pwAdmin, pwSec] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('secretario123', 10),
  ]);

  const [admin, sec1, sec2, sec3] = await Promise.all([
    prisma.usuario.upsert({ where: { email: 'admin@transportes.com' }, update: {}, create: { nombre: 'Administrador Principal', email: 'admin@transportes.com', passwordHash: pwAdmin, rol: Rol.ADMIN } }),
    prisma.usuario.upsert({ where: { email: 'secretario@transportes.com' }, update: {}, create: { nombre: 'María García López', email: 'secretario@transportes.com', passwordHash: pwSec, rol: Rol.SECRETARIO } }),
    prisma.usuario.upsert({ where: { email: 'operaciones@transportes.com' }, update: {}, create: { nombre: 'Carlos Mendoza Ríos', email: 'operaciones@transportes.com', passwordHash: pwSec, rol: Rol.SECRETARIO } }),
    prisma.usuario.upsert({ where: { email: 'facturacion@transportes.com' }, update: {}, create: { nombre: 'Rosa Huanca Quispe', email: 'facturacion@transportes.com', passwordHash: pwSec, rol: Rol.SECRETARIO } }),
  ]);
  console.log('✅ Usuarios (4)');

  // ── CLIENTES (10) ─────────────────────────────────────────────────────────
  const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = await Promise.all([
    prisma.cliente.upsert({ where: { ruc: '20123456789' }, update: {}, create: { razonSocial: 'Distribuidora Lima S.A.C.', ruc: '20123456789', direccion: 'Av. Industrial 1234, Lima', telefono: '01-2345678', email: 'contacto@distribuidoralima.com', condicionPago: '30' } }),
    prisma.cliente.upsert({ where: { ruc: '20987654321' }, update: {}, create: { razonSocial: 'Exportaciones Norte E.I.R.L.', ruc: '20987654321', direccion: 'Jr. Comercio 567, Trujillo', telefono: '044-567890', email: 'admin@exportnorte.pe', condicionPago: '15' } }),
    prisma.cliente.upsert({ where: { ruc: '10456789012' }, update: {}, create: { razonSocial: 'Juan Pérez Quispe', ruc: '10456789012', direccion: 'Calle Los Pinos 89, Arequipa', telefono: '054-234567', condicionPago: 'CONTADO' } }),
    prisma.cliente.upsert({ where: { ruc: '20345678901' }, update: {}, create: { razonSocial: 'Minera Andina S.A.C.', ruc: '20345678901', direccion: 'Av. Minería 450, Cerro de Pasco', telefono: '063-456789', email: 'logistica@mineraandina.com', condicionPago: '60' } }),
    prisma.cliente.upsert({ where: { ruc: '20456789013' }, update: {}, create: { razonSocial: 'Agrícola San Martín E.I.R.L.', ruc: '20456789013', direccion: 'Carretera Yurimaguas Km 12, San Martín', telefono: '042-678901', email: 'ventas@agricolasanmartin.pe', condicionPago: '30' } }),
    prisma.cliente.upsert({ where: { ruc: '20567890124' }, update: {}, create: { razonSocial: 'Textiles Miraflores S.A.', ruc: '20567890124', direccion: 'Jr. Ica 890, Miraflores, Lima', telefono: '01-4567890', email: 'despacho@textilesmiraflores.com', condicionPago: '30' } }),
    prisma.cliente.upsert({ where: { ruc: '20678901235' }, update: {}, create: { razonSocial: 'Importaciones Callao S.R.L.', ruc: '20678901235', direccion: 'Av. Néstor Gambetta 2345, Callao', telefono: '01-5678901', condicionPago: 'CONTADO' } }),
    prisma.cliente.upsert({ where: { ruc: '20789012346' }, update: {}, create: { razonSocial: 'Pesquera del Sur S.A.C.', ruc: '20789012346', direccion: 'Puerto de Ilo, Moquegua', telefono: '053-789012', email: 'logistica@pesqueradelsur.pe', condicionPago: '15' } }),
    prisma.cliente.upsert({ where: { ruc: '20890123457' }, update: {}, create: { razonSocial: 'Constructora Lima Norte S.A.', ruc: '20890123457', direccion: 'Av. Universitaria 3456, Los Olivos, Lima', telefono: '01-6789012', email: 'obras@constructoraln.com', condicionPago: '60' } }),
    prisma.cliente.upsert({ where: { ruc: '20901234568' }, update: {}, create: { razonSocial: 'Ferretería Industrial Perú E.I.R.L.', ruc: '20901234568', direccion: 'Calle Los Herreros 123, Ate, Lima', telefono: '01-7890123', email: 'pedidos@ferreteriaperu.com', condicionPago: 'CONTADO' } }),
  ]);
  console.log('✅ Clientes (10)');

  // ── CONDUCTORES (10) ──────────────────────────────────────────────────────
  const [con1, con2, con3, con4, con5, con6, con7, , con9, con10] = await Promise.all([
    prisma.conductor.upsert({ where: { dni: '12345678' }, update: {}, create: { nombre: 'Roberto Flores Huamán', dni: '12345678', licencia: 'Q12345678', vencimientoLicencia: new Date('2026-03-15'), telefono: '987654321', direccion: 'Jr. Los Álamos 123, Lima', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '23456789' }, update: {}, create: { nombre: 'Miguel Ángel Torres Soto', dni: '23456789', licencia: 'Q23456789', vencimientoLicencia: new Date('2025-08-20'), telefono: '976543210', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '34567890' }, update: {}, create: { nombre: 'Luis Alberto Quispe Mamani', dni: '34567890', licencia: 'Q34567890', vencimientoLicencia: new Date('2026-11-30'), telefono: '965432109', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '45678901' }, update: {}, create: { nombre: 'Jorge Antonio Ramos Vega', dni: '45678901', licencia: 'Q45678901', vencimientoLicencia: new Date('2025-05-10'), telefono: '954321098', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '56789012' }, update: {}, create: { nombre: 'Pedro Pablo Díaz Campos', dni: '56789012', licencia: 'Q56789012', vencimientoLicencia: new Date('2026-07-25'), telefono: '943210987', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '67890123' }, update: {}, create: { nombre: 'Juan Carlos Vargas Cruz', dni: '67890123', licencia: 'Q67890123', vencimientoLicencia: new Date('2025-12-01'), telefono: '932109876', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '78901234' }, update: {}, create: { nombre: 'Ángel Mamani Quispe', dni: '78901234', licencia: 'Q78901234', vencimientoLicencia: new Date('2026-02-14'), telefono: '921098765', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '89012345' }, update: {}, create: { nombre: 'César Augusto Paredes León', dni: '89012345', licencia: 'Q89012345', vencimientoLicencia: new Date('2025-09-30'), activo: false, observaciones: 'Suspendido temporalmente' } }),
    prisma.conductor.upsert({ where: { dni: '90123456' }, update: {}, create: { nombre: 'Edwin Raúl Santos Medina', dni: '90123456', licencia: 'Q90123456', vencimientoLicencia: new Date('2026-06-18'), telefono: '909876543', activo: true } }),
    prisma.conductor.upsert({ where: { dni: '01234567' }, update: {}, create: { nombre: 'Fernando José Chávez Aguirre', dni: '01234567', licencia: 'Q01234567', vencimientoLicencia: new Date('2025-10-05'), telefono: '898765432', activo: true } }),
  ]);
  console.log('✅ Conductores (10)');

  // ── VEHÍCULOS (10): 6 tractos + 4 carretas ────────────────────────────────
  const [vt1, vt2, vt3, vt4, vt5, , vc1, vc2, vc3, vc4] = await Promise.all([
    prisma.vehiculo.upsert({ where: { placa: 'ABC-123' }, update: {}, create: { placa: 'ABC-123', tipo: TipoVehiculo.TRACTO, marca: 'Volvo', modelo: 'FH16 750', anio: 2020, vencimientoSoat: new Date('2025-12-31'), vencimientoRevision: new Date('2025-06-30'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'DEF-456' }, update: {}, create: { placa: 'DEF-456', tipo: TipoVehiculo.TRACTO, marca: 'Scania', modelo: 'R500', anio: 2019, vencimientoSoat: new Date('2025-09-30'), vencimientoRevision: new Date('2025-03-31'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'GHI-789' }, update: {}, create: { placa: 'GHI-789', tipo: TipoVehiculo.TRACTO, marca: 'Mercedes-Benz', modelo: 'Actros 2651', anio: 2021, vencimientoSoat: new Date('2026-01-31'), vencimientoRevision: new Date('2026-01-31'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'JKL-012' }, update: {}, create: { placa: 'JKL-012', tipo: TipoVehiculo.TRACTO, marca: 'Kenworth', modelo: 'T800', anio: 2018, vencimientoSoat: new Date('2025-07-31'), estado: 'MANTENIMIENTO', observaciones: 'En taller — cambio de frenos' } }),
    prisma.vehiculo.upsert({ where: { placa: 'MNO-345' }, update: {}, create: { placa: 'MNO-345', tipo: TipoVehiculo.TRACTO, marca: 'Freightliner', modelo: 'Cascadia', anio: 2022, vencimientoSoat: new Date('2026-03-31'), vencimientoRevision: new Date('2026-03-31'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'PQR-678' }, update: {}, create: { placa: 'PQR-678', tipo: TipoVehiculo.TRACTO, marca: 'International', modelo: 'ProStar', anio: 2017, vencimientoSoat: new Date('2025-05-31'), estado: 'OPERATIVO', activo: false, observaciones: 'Unidad retirada' } }),
    prisma.vehiculo.upsert({ where: { placa: 'STU-901' }, update: {}, create: { placa: 'STU-901', tipo: TipoVehiculo.CARRETA, marca: 'Fruehauf', modelo: 'SR-40', anio: 2019, vencimientoSoat: new Date('2025-11-30'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'VWX-234' }, update: {}, create: { placa: 'VWX-234', tipo: TipoVehiculo.CARRETA, marca: 'Randon', modelo: 'RS-40', anio: 2020, vencimientoSoat: new Date('2026-02-28'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'YZA-567' }, update: {}, create: { placa: 'YZA-567', tipo: TipoVehiculo.CARRETA, marca: 'Furgovan', modelo: 'FV-30', anio: 2018, vencimientoSoat: new Date('2025-08-31'), estado: 'OPERATIVO' } }),
    prisma.vehiculo.upsert({ where: { placa: 'BCD-890' }, update: {}, create: { placa: 'BCD-890', tipo: TipoVehiculo.CARRETA, marca: 'Facchini', modelo: 'SR-45', anio: 2021, vencimientoSoat: new Date('2026-04-30'), estado: 'OPERATIVO' } }),
  ]);
  console.log('✅ Vehículos (10)');

  // ── PEDIDOS (15) ──────────────────────────────────────────────────────────
  const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15] = await Promise.all([
    prisma.pedido.create({ data: { clienteId: c1.id, usuarioId: sec1.id, origen: 'Lima - Callao', destino: 'Trujillo - La Libertad', tipoCarga: 'Mercadería general', tarifa: 1500, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-01-10') } }),
    prisma.pedido.create({ data: { clienteId: c2.id, usuarioId: sec1.id, origen: 'Trujillo', destino: 'Lima - Miraflores', tipoCarga: 'Productos refrigerados', tarifa: 2200, estado: EstadoPedido.FACTURADO, observaciones: 'Requiere cadena de frío', fechaPedido: new Date('2024-01-18') } }),
    prisma.pedido.create({ data: { clienteId: c3.id, usuarioId: admin.id, origen: 'Arequipa', destino: 'Lima - Los Olivos', tipoCarga: 'Electrodomésticos', tarifa: 900, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-02-03') } }),
    prisma.pedido.create({ data: { clienteId: c4.id, usuarioId: sec2.id, origen: 'Lima', destino: 'Cerro de Pasco', tipoCarga: 'Materiales de construcción', tarifa: 1800, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-02-14') } }),
    prisma.pedido.create({ data: { clienteId: c5.id, usuarioId: sec1.id, origen: 'Lima', destino: 'Tarapoto - San Martín', tipoCarga: 'Insumos agrícolas', tarifa: 3200, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-02-28') } }),
    prisma.pedido.create({ data: { clienteId: c6.id, usuarioId: sec2.id, origen: 'Lima', destino: 'Chiclayo - Lambayeque', tipoCarga: 'Textiles y confecciones', tarifa: 1600, estado: EstadoPedido.ACTIVO, fechaPedido: new Date('2024-03-05') } }),
    prisma.pedido.create({ data: { clienteId: c7.id, usuarioId: sec3.id, origen: 'Callao', destino: 'Arequipa', tipoCarga: 'Importaciones marítimas', tarifa: 2500, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-03-12') } }),
    prisma.pedido.create({ data: { clienteId: c8.id, usuarioId: sec1.id, origen: 'Lima', destino: 'Ilo - Moquegua', tipoCarga: 'Insumos pesqueros', tarifa: 2800, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-03-20') } }),
    prisma.pedido.create({ data: { clienteId: c9.id, usuarioId: sec2.id, origen: 'Lima', destino: 'Huancayo - Junín', tipoCarga: 'Materiales de construcción', tarifa: 1100, estado: EstadoPedido.ACTIVO, fechaPedido: new Date('2024-04-01') } }),
    prisma.pedido.create({ data: { clienteId: c10.id, usuarioId: sec3.id, origen: 'Lima - Ate', destino: 'Ica', tipoCarga: 'Ferretería industrial', tarifa: 800, estado: EstadoPedido.ACTIVO, fechaPedido: new Date('2024-04-08') } }),
    prisma.pedido.create({ data: { clienteId: c1.id, usuarioId: sec1.id, origen: 'Lima', destino: 'Chiclayo', tipoCarga: 'Mercadería diversa', tarifa: 1900, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-04-15') } }),
    prisma.pedido.create({ data: { clienteId: c2.id, usuarioId: sec2.id, origen: 'Trujillo', destino: 'Chiclayo', tipoCarga: 'Exportaciones regionales', tarifa: 1400, estado: EstadoPedido.ACTIVO, fechaPedido: new Date('2024-04-22') } }),
    prisma.pedido.create({ data: { clienteId: c3.id, usuarioId: sec1.id, origen: 'Lima', destino: 'Piura', tipoCarga: 'Electrodomésticos y equipos', tarifa: 2700, estado: EstadoPedido.FACTURADO, fechaPedido: new Date('2024-05-02') } }),
    prisma.pedido.create({ data: { clienteId: c4.id, usuarioId: sec3.id, origen: 'Lima', destino: 'Cusco', tipoCarga: 'Materiales mineros', tarifa: 3500, estado: EstadoPedido.ACTIVO, fechaPedido: new Date('2024-05-10') } }),
    prisma.pedido.create({ data: { clienteId: c5.id, usuarioId: admin.id, origen: 'Lima', destino: 'Iquitos - Loreto', tipoCarga: 'Alimentos y víveres', tarifa: 4000, estado: EstadoPedido.ANULADO, observaciones: 'Cancelado por el cliente', fechaPedido: new Date('2024-05-15') } }),
  ]);
  console.log('✅ Pedidos (15)');

  // ── CAJAS (3) ─────────────────────────────────────────────────────────────
  const [caja1, caja2, caja3] = await Promise.all([
    prisma.caja.create({ data: { usuarioId: admin.id, nombre: 'Caja Principal Enero', fecha: new Date('2024-01-15'), saldoApertura: 2000, estado: EstadoCaja.CERRADA, saldoCierre: 5300, observaciones: 'Cierre mes de enero' } }),
    prisma.caja.create({ data: { usuarioId: sec1.id, nombre: 'Caja Operaciones Marzo', fecha: new Date('2024-03-01'), saldoApertura: 1500, estado: EstadoCaja.CERRADA, saldoCierre: 6700 } }),
    prisma.caja.create({ data: { usuarioId: admin.id, nombre: 'Caja Principal', fecha: new Date(), saldoApertura: 1000, estado: EstadoCaja.ABIERTA } }),
  ]);
  console.log('✅ Cajas (3)');

  // ── FACTURAS (12) ─────────────────────────────────────────────────────────
  const [fac1, fac2, fac3, fac4, fac5, fac6, fac7, fac8, fac9, fac10, fac11, fac12] = await Promise.all([
    prisma.factura.create({ data: { pedidoId: p1.id,  clienteId: c1.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 1,  numeroFactura: 'F001-00001', ...igv(1500), estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-02-15'), totalPagado: 1500 } }),
    prisma.factura.create({ data: { pedidoId: p2.id,  clienteId: c2.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 2,  numeroFactura: 'F001-00002', ...igv(2200), estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-02-28'), totalPagado: 2200 } }),
    prisma.factura.create({ data: { pedidoId: p3.id,  clienteId: c3.id, usuarioId: admin.id, serie: 'F001', correlativo: 3,  numeroFactura: 'F001-00003', ...igv(900),  estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-03-03'), totalPagado: 900  } }),
    prisma.factura.create({ data: { pedidoId: p4.id,  clienteId: c4.id, usuarioId: sec2.id,  serie: 'F001', correlativo: 4,  numeroFactura: 'F001-00004', ...igv(1800), estado: EstadoFactura.EMITIDA,  fechaVencimiento: new Date('2024-03-16') } }),
    prisma.factura.create({ data: { pedidoId: p5.id,  clienteId: c5.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 5,  numeroFactura: 'F001-00005', ...igv(3200), estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-03-30'), totalPagado: 3200 } }),
    prisma.factura.create({ data: { pedidoId: p7.id,  clienteId: c7.id, usuarioId: sec3.id,  serie: 'F001', correlativo: 6,  numeroFactura: 'F001-00006', ...igv(2500), estado: EstadoFactura.PARCIAL,  fechaVencimiento: new Date('2024-04-12'), totalPagado: 1000 } }),
    prisma.factura.create({ data: { pedidoId: p8.id,  clienteId: c8.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 7,  numeroFactura: 'F001-00007', ...igv(2800), estado: EstadoFactura.EMITIDA,  fechaVencimiento: new Date('2024-04-22') } }),
    prisma.factura.create({ data: { pedidoId: p11.id, clienteId: c1.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 8,  numeroFactura: 'F001-00008', ...igv(1900), estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-05-15'), totalPagado: 1900 } }),
    prisma.factura.create({ data: { pedidoId: p13.id, clienteId: c3.id, usuarioId: sec1.id,  serie: 'F001', correlativo: 9,  numeroFactura: 'F001-00009', ...igv(2700), estado: EstadoFactura.PENDIENTE, fechaVencimiento: new Date('2024-06-02') } }),
    prisma.factura.create({ data: {                   clienteId: c6.id, usuarioId: sec2.id,  serie: 'F001', correlativo: 10, numeroFactura: 'F001-00010', ...igv(1200), estado: EstadoFactura.PAGADA,   fechaVencimiento: new Date('2024-05-20'), totalPagado: 1200 } }),
    prisma.factura.create({ data: {                   clienteId: c9.id, usuarioId: sec2.id,  serie: 'F001', correlativo: 11, numeroFactura: 'F001-00011', ...igv(950),  estado: EstadoFactura.EMITIDA,  fechaVencimiento: new Date('2024-06-10') } }),
    prisma.factura.create({ data: {                   clienteId: c2.id, usuarioId: sec3.id,  serie: 'F001', correlativo: 12, numeroFactura: 'F001-00012', ...igv(1600), estado: EstadoFactura.ANULADA,  fechaVencimiento: new Date('2024-06-30'), observaciones: 'Anulada por error de datos' } }),
  ]);
  console.log('✅ Facturas (12)');

  // ── MOVIMIENTOS DE CAJA ───────────────────────────────────────────────────
  await prisma.movimientoCaja.createMany({
    data: [
      { cajaId: caja1.id, tipo: TipoMovimientoCaja.INGRESO, monto: 1500, concepto: `Cobro factura F001-00001`, fecha: new Date('2024-01-20') },
      { cajaId: caja1.id, tipo: TipoMovimientoCaja.INGRESO, monto: 900,  concepto: `Cobro factura F001-00003`, fecha: new Date('2024-02-10') },
      { cajaId: caja1.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 350,  concepto: 'Pago combustible unidad ABC-123', fecha: new Date('2024-01-18') },
      { cajaId: caja1.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 500,  concepto: 'Anticipo conductor Roberto Flores', fecha: new Date('2024-01-12') },
      { cajaId: caja2.id, tipo: TipoMovimientoCaja.INGRESO, monto: 2200, concepto: `Cobro factura F001-00002`, fecha: new Date('2024-02-05') },
      { cajaId: caja2.id, tipo: TipoMovimientoCaja.INGRESO, monto: 3200, concepto: `Cobro factura F001-00005`, fecha: new Date('2024-03-15') },
      { cajaId: caja2.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 700,  concepto: 'Anticipo conductor Miguel Torres', fecha: new Date('2024-03-02') },
      { cajaId: caja2.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 280,  concepto: 'Peajes y gastos varios ruta Trujillo', fecha: new Date('2024-03-10') },
      { cajaId: caja3.id, tipo: TipoMovimientoCaja.INGRESO, monto: 1900, concepto: `Cobro factura F001-00008`, fecha: new Date('2024-04-20') },
      { cajaId: caja3.id, tipo: TipoMovimientoCaja.INGRESO, monto: 1000, concepto: `Cobro parcial factura F001-00006`, fecha: new Date('2024-04-01') },
      { cajaId: caja3.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 620,  concepto: 'Anticipo conductor Edwin Santos', fecha: new Date('2024-04-12') },
      { cajaId: caja3.id, tipo: TipoMovimientoCaja.EGRESO,  monto: 400,  concepto: 'Anticipo conductor Fernando Chávez', fecha: new Date('2024-04-28') },
    ],
  });
  console.log('✅ Movimientos de caja (12)');

  // ── COMBUSTIBLE (10) ──────────────────────────────────────────────────────
  await prisma.combustible.createMany({
    data: [
      { vehiculoId: vt1.id, conductorId: con1.id, fecha: new Date('2024-01-11'), galones: 80,  monto: 350, kilometraje: 45230, grifo: 'Primax Panamericana Norte' },
      { vehiculoId: vt2.id, conductorId: con2.id, fecha: new Date('2024-01-19'), galones: 95,  monto: 415, kilometraje: 62140, grifo: 'Repsol Trujillo' },
      { vehiculoId: vt3.id, conductorId: con3.id, fecha: new Date('2024-02-04'), galones: 75,  monto: 328, kilometraje: 38760, grifo: 'Petroperú Arequipa' },
      { vehiculoId: vt4.id, conductorId: con4.id, fecha: new Date('2024-02-14'), galones: 65,  monto: 284, kilometraje: 71520, grifo: 'Primax Lima Norte' },
      { vehiculoId: vt5.id, conductorId: con5.id, fecha: new Date('2024-02-29'), galones: 100, monto: 437, kilometraje: 29850, grifo: 'Repsol Carretera Central' },
      { vehiculoId: vt1.id, conductorId: con1.id, fecha: new Date('2024-03-13'), galones: 85,  monto: 372, kilometraje: 46890, grifo: 'Primax Panamericana Sur' },
      { vehiculoId: vt2.id, conductorId: con6.id, fecha: new Date('2024-03-21'), galones: 90,  monto: 394, kilometraje: 63400, grifo: 'Petroperú Chiclayo' },
      { vehiculoId: vt3.id, conductorId: con9.id, fecha: new Date('2024-04-11'), galones: 72,  monto: 315, kilometraje: 39820, grifo: 'Repsol Moquegua' },
      { vehiculoId: vt5.id, conductorId: con10.id, fecha: new Date('2024-04-26'), galones: 68, monto: 297, kilometraje: 31200, grifo: 'Primax Huancayo' },
      { vehiculoId: vt4.id, conductorId: con4.id, fecha: new Date('2024-05-03'), galones: 78,  monto: 341, kilometraje: 72680, grifo: 'Petroperú Lima Sur' },
    ],
  });
  console.log('✅ Combustible (10)');

  // ── LIQUIDACIONES (8) con detalles y pedidos ──────────────────────────────
  const liq1 = await prisma.liquidacion.create({ data: { conductorId: con1.id, placaTracto: 'ABC-123', placaCarreta: 'STU-901', montoEntregado: 500, fecha: new Date('2024-01-12'), guiaReferencia: 'G-001', totalGastos: 270, estado: 'PAGADO' } });
  const liq2 = await prisma.liquidacion.create({ data: { conductorId: con2.id, placaTracto: 'DEF-456', placaCarreta: 'VWX-234', montoEntregado: 600, fecha: new Date('2024-01-20'), guiaReferencia: 'G-002', totalGastos: 370, estado: 'PAGADO' } });
  const liq3 = await prisma.liquidacion.create({ data: { conductorId: con3.id, placaTracto: 'GHI-789', placaCarreta: 'YZA-567', montoEntregado: 450, fecha: new Date('2024-02-05'), guiaReferencia: 'G-003', totalGastos: 210, estado: 'PAGADO' } });
  const liq4 = await prisma.liquidacion.create({ data: { conductorId: con4.id, placaTracto: 'JKL-012', montoEntregado: 700, fecha: new Date('2024-02-16'), guiaReferencia: 'G-004', totalGastos: 430, estado: 'PENDIENTE', observaciones: 'Pendiente revisión de gastos' } });
  const liq5 = await prisma.liquidacion.create({ data: { conductorId: con5.id, placaTracto: 'MNO-345', placaCarreta: 'BCD-890', montoEntregado: 800, fecha: new Date('2024-03-01'), guiaReferencia: 'G-005', totalGastos: 490, estado: 'PAGADO' } });
  const liq6 = await prisma.liquidacion.create({ data: { conductorId: con1.id, placaTracto: 'ABC-123', placaCarreta: 'STU-901', montoEntregado: 550, fecha: new Date('2024-03-22'), guiaReferencia: 'G-006', totalGastos: 310, estado: 'PAGADO' } });
  const liq7 = await prisma.liquidacion.create({ data: { conductorId: con9.id, placaTracto: 'DEF-456', placaCarreta: 'VWX-234', montoEntregado: 620, fecha: new Date('2024-04-12'), guiaReferencia: 'G-007', totalGastos: 380, estado: 'PAGADO' } });
  const liq8 = await prisma.liquidacion.create({ data: { conductorId: con10.id, placaTracto: 'GHI-789', montoEntregado: 400, fecha: new Date('2024-04-28'), guiaReferencia: 'G-008', totalGastos: 180, estado: 'PENDIENTE' } });

  await prisma.liquidacionDetalle.createMany({
    data: [
      { liquidacionId: liq1.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes Panamericana Norte',        monto: 150 },
      { liquidacionId: liq1.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 2 días',                 monto: 120 },
      { liquidacionId: liq2.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes ruta Trujillo - Lima',      monto: 200 },
      { liquidacionId: liq2.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos conductor',              monto: 150 },
      { liquidacionId: liq2.id, categoria: CategoriaDetalle.BALANZA,  descripcion: 'Control de peso Pacasmayo',       monto: 20  },
      { liquidacionId: liq3.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes Panamericana Sur',          monto: 110 },
      { liquidacionId: liq3.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 2 días ruta sur',        monto: 100 },
      { liquidacionId: liq4.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes carretera central',         monto: 180 },
      { liquidacionId: liq4.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 3 días',                 monto: 200 },
      { liquidacionId: liq4.id, categoria: CategoriaDetalle.OTROS,   descripcion: 'Gastos imprevistos ruta',          monto: 50  },
      { liquidacionId: liq5.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes ruta Lima - Tarapoto',      monto: 250 },
      { liquidacionId: liq5.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 4 días',                 monto: 200 },
      { liquidacionId: liq5.id, categoria: CategoriaDetalle.BALANZA,  descripcion: 'Control de peso Tingo María',     monto: 40  },
      { liquidacionId: liq6.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes Panamericana Norte',        monto: 160 },
      { liquidacionId: liq6.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 2 días',                 monto: 150 },
      { liquidacionId: liq7.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes Lima - Ilo',                monto: 190 },
      { liquidacionId: liq7.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 3 días ruta sur',        monto: 160 },
      { liquidacionId: liq7.id, categoria: CategoriaDetalle.BALANZA,  descripcion: 'Control de peso Ica',             monto: 30  },
      { liquidacionId: liq8.id, categoria: CategoriaDetalle.PEAJE,   descripcion: 'Peajes ruta Lima - Chiclayo',      monto: 100 },
      { liquidacionId: liq8.id, categoria: CategoriaDetalle.VIATICO,  descripcion: 'Viáticos 2 días',                 monto: 80  },
    ],
  });

  await prisma.liquidacionPedido.createMany({
    data: [
      { liquidacionId: liq1.id, pedidoId: p1.id  },
      { liquidacionId: liq2.id, pedidoId: p2.id  },
      { liquidacionId: liq3.id, pedidoId: p3.id  },
      { liquidacionId: liq4.id, pedidoId: p4.id  },
      { liquidacionId: liq5.id, pedidoId: p5.id  },
      { liquidacionId: liq6.id, pedidoId: p7.id  },
      { liquidacionId: liq7.id, pedidoId: p8.id  },
      { liquidacionId: liq8.id, pedidoId: p11.id },
    ],
  });
  console.log('✅ Liquidaciones (8) con detalles y pedidos');

  // ── SERIE DE FACTURACIÓN ──────────────────────────────────────────────────
  await prisma.serieFacturacion.upsert({
    where: { serie: 'F001' },
    update: { correlativoActual: 13 },
    create: { serie: 'F001', tipoDocumento: 'FACTURA', correlativoActual: 13, correlativoInicial: 1, activo: true, descripcion: 'Serie principal de facturación' },
  });
  console.log('✅ Series de facturación');

  // ── CONFIGURACIÓN BÁSICA ──────────────────────────────────────────────────
  const configs = [
    { clave: 'empresa_nombre',   valor: 'Transportes Salvador S.A.C.', tipo: 'texto',  categoria: 'empresa',    etiqueta: 'Nombre de la empresa' },
    { clave: 'empresa_ruc',      valor: '20123456001',                  tipo: 'texto',  categoria: 'empresa',    etiqueta: 'RUC' },
    { clave: 'empresa_direccion',valor: 'Av. La Marina 1234, Lima',     tipo: 'texto',  categoria: 'empresa',    etiqueta: 'Dirección' },
    { clave: 'empresa_telefono', valor: '01-4567890',                   tipo: 'texto',  categoria: 'empresa',    etiqueta: 'Teléfono' },
    { clave: 'igv_porcentaje',   valor: '18',                           tipo: 'numero', categoria: 'facturacion',etiqueta: 'Porcentaje IGV' },
    { clave: 'moneda_default',   valor: 'PEN',                          tipo: 'texto',  categoria: 'facturacion',etiqueta: 'Moneda por defecto' },
  ];
  for (const cfg of configs) {
    await prisma.configuracion.upsert({ where: { clave: cfg.clave }, update: { valor: cfg.valor }, create: cfg });
  }
  console.log('✅ Configuración básica');

  // ── LOG ───────────────────────────────────────────────────────────────────
  await prisma.logActividad.create({
    data: { usuarioId: admin.id, accion: 'SEED', modulo: 'SISTEMA', detalle: 'Base de datos inicializada con datos de prueba completos' },
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('🚀 Seed completado exitosamente');
  console.log('');
  console.log('  Módulos poblados:');
  console.log('  • Usuarios: 4  • Clientes: 10  • Conductores: 10');
  console.log('  • Vehículos: 10  • Pedidos: 15  • Facturas: 12');
  console.log('  • Cajas: 3');
  console.log('  • Combustible: 10  • Liquidaciones: 8');
  console.log('');
  console.log('  Credenciales:');
  console.log('  ADMIN:      admin@transportes.com / admin123');
  console.log('  SECRETARIO: secretario@transportes.com / secretario123');
  console.log('══════════════════════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
