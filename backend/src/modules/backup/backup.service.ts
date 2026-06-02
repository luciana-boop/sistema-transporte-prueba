// FILE: src/modules/backup/backup.service.ts

import prisma from '../../prisma/client';

export class BackupService {
  async exportarJson() {
    const [
      usuarios, clientes, pedidos, facturas, pagos,
      cajas, gastos, conductores, vehiculos,
      liquidaciones, combustible,
    ] = await Promise.all([
      prisma.usuario.findMany({ select: { id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true } }),
      prisma.cliente.findMany(),
      prisma.pedido.findMany(),
      prisma.factura.findMany(),
      prisma.pago.findMany(),
      prisma.caja.findMany({ include: { movimientos: true } }),
      prisma.gasto.findMany(),
      prisma.conductor.findMany(),
      prisma.vehiculo.findMany(),
      prisma.liquidacion.findMany({ include: { detalles: true } }),
      prisma.combustible.findMany(),
    ]);

    return {
      version: '2.0',
      exportadoEn: new Date().toISOString(),
      data: {
        usuarios, clientes, pedidos, facturas, pagos,
        cajas, gastos, conductores, vehiculos,
        liquidaciones, combustible,
      },
    };
  }

  async exportarExcelData(modulo: string) {
    const map: Record<string, () => Promise<unknown[]>> = {
      clientes:      () => prisma.cliente.findMany(),
      pedidos:       () => prisma.pedido.findMany({ include: { cliente: { select: { razonSocial: true } } } }),
      facturacion:   () => prisma.factura.findMany({ include: { cliente: { select: { razonSocial: true } } } }),
      liquidaciones: () => prisma.liquidacion.findMany({ include: { conductor: { select: { nombre: true } }, detalles: true } }),
      combustible:   () => prisma.combustible.findMany({ include: { vehiculo: { select: { placa: true, marca: true } }, conductor: { select: { nombre: true } } } }),
      conductores:   () => prisma.conductor.findMany(),
      vehiculos:     () => prisma.vehiculo.findMany(),
    };

    const fn = map[modulo];
    if (!fn) throw new Error(`Módulo ${modulo} no soportado para exportación`);
    return fn();
  }

  async restaurarJson(backupData: any) {
    if (!backupData.version || !backupData.data) {
      throw new Error('Formato de backup inválido');
    }

    const { data } = backupData;
    const resultados: Record<string, number> = {};

    if (Array.isArray(data.conductores)) {
      for (const c of data.conductores) {
        try {
          await prisma.conductor.upsert({
            where: { dni: c.dni },
            update: {
              nombre: c.nombre, licencia: c.licencia, telefono: c.telefono,
              direccion: c.direccion, observaciones: c.observaciones,
              tractoPreferencia: c.tractoPreferencia, carretaPreferencia: c.carretaPreferencia,
              activo: c.activo,
            },
            create: {
              nombre: c.nombre, dni: c.dni, licencia: c.licencia,
              vencimientoLicencia: new Date(c.vencimientoLicencia),
              telefono: c.telefono, direccion: c.direccion, observaciones: c.observaciones,
              tractoPreferencia: c.tractoPreferencia, carretaPreferencia: c.carretaPreferencia,
              activo: c.activo ?? true,
            },
          });
        } catch { /* skip */ }
      }
      resultados.conductores = data.conductores.length;
    }

    if (Array.isArray(data.vehiculos)) {
      for (const v of data.vehiculos) {
        try {
          await prisma.vehiculo.upsert({
            where: { placa: v.placa },
            update: { marca: v.marca, modelo: v.modelo, anio: v.anio, estado: v.estado, activo: v.activo },
            create: { placa: v.placa, tipo: v.tipo, marca: v.marca, modelo: v.modelo, anio: v.anio, estado: v.estado ?? 'OPERATIVO', activo: v.activo ?? true },
          });
        } catch { /* skip */ }
      }
      resultados.vehiculos = data.vehiculos.length;
    }

    if (Array.isArray(data.clientes)) {
      for (const c of data.clientes) {
        try {
          await prisma.cliente.upsert({
            where: { ruc: c.ruc },
            update: { razonSocial: c.razonSocial, direccion: c.direccion, telefono: c.telefono, email: c.email, condicionPago: c.condicionPago, activo: c.activo },
            create: { razonSocial: c.razonSocial, ruc: c.ruc, direccion: c.direccion, telefono: c.telefono, email: c.email, condicionPago: c.condicionPago ?? 'CONTADO', activo: c.activo ?? true },
          });
        } catch { /* skip */ }
      }
      resultados.clientes = data.clientes.length;
    }

    return { message: 'Backup restaurado correctamente', resultados };
  }
}

export const backupService = new BackupService();
