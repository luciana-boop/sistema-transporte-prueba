// FILE: src/modules/backup/backup.service.ts

import prisma from '../../prisma/client';

export class BackupService {
  async exportarJson() {
    const [
      usuarios, clientes, pedidos, facturas,
      cajas, conductores, vehiculos,
      liquidaciones, combustible, logsActividad,
      configuraciones, seriesFacturacion, tablasMaestras,
      configuracionAlertas, tiposVehiculo,
      permisosModulos, permisosAcciones,
      monedas, tiposPago, cuentasDinero, movimientosCuenta, pagosV2, pagosV2AplicacionesFactura,
      guias, mantenimientoDetalles,
    ] = await Promise.all([
      prisma.usuario.findMany({
        select: {
          id: true, nombre: true, email: true, rol: true, activo: true, creadoEn: true,
          restriccionHorarioActiva: true, diasPermitidos: true, horaInicio: true, horaFin: true,
        },
      }),
      prisma.cliente.findMany(),
      prisma.pedido.findMany(),
      prisma.factura.findMany({ include: { lineas: true } }),
      prisma.caja.findMany({ include: { movimientos: true } }),
      prisma.conductor.findMany(),
      prisma.vehiculo.findMany(),
      prisma.liquidacion.findMany({ include: { detalles: true, pedidos: true } }),
      prisma.combustible.findMany(),
      prisma.logActividad.findMany(),
      prisma.configuracion.findMany(),
      prisma.serieFacturacion.findMany(),
      prisma.tablaMaestra.findMany(),
      prisma.configuracionAlerta.findMany(),
      prisma.tipoVehiculoConfig.findMany(),
      prisma.permisoModulo.findMany(),
      prisma.permisoAccion.findMany(),
      prisma.moneda.findMany(),
      prisma.tipoPago.findMany(),
      prisma.cuentaDinero.findMany(),
      prisma.movimientoCuentaV2.findMany(),
      prisma.pagoV2.findMany(),
      prisma.pagoV2AplicacionFactura.findMany(),
      prisma.guia.findMany({ include: { detalles: true, transportistasAdicionales: true } }),
      prisma.mantenimientoDetalle.findMany(),
    ]);

    return {
      version: '3.2',
      exportadoEn: new Date().toISOString(),
      data: {
        usuarios, clientes, pedidos, facturas,
        cajas, conductores, vehiculos,
        liquidaciones, combustible, logsActividad,
        configuraciones, seriesFacturacion, tablasMaestras,
        configuracionAlertas, tiposVehiculo,
        permisosModulos, permisosAcciones,
        monedas, tiposPago, cuentasDinero, movimientosCuenta, pagosV2, pagosV2AplicacionesFactura,
        guias, mantenimientoDetalles,
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
      movimientos:   () => prisma.movimientoCuentaV2.findMany({ include: { cuenta: { select: { nombre: true } } } }),
      guias:         () => prisma.guia.findMany({ include: { cliente: { select: { razonSocial: true } } } }),
      mantenimiento: () => prisma.mantenimientoDetalle.findMany({ include: { vehiculo: { select: { placa: true } }, conductor: { select: { nombre: true } } } }),
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
    const errores: string[] = [];

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
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
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
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
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
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.clientes = data.clientes.length;
    }

    // Datos maestros / de configuración: se restauran por upsert sobre su clave
    // de negocio única, igual que conductores/vehículos/clientes arriba. No se
    // tocan datos transaccionales (pedidos, facturas, pagos, cajas, liquidaciones,
    // movimientos, etc.): restaurarlos requeriría reordenar por dependencias FK
    // y podría duplicar saldos y movimientos ya existentes en el sistema destino.
    if (Array.isArray(data.tablasMaestras)) {
      for (const t of data.tablasMaestras) {
        try {
          await prisma.tablaMaestra.upsert({
            where: { tipo_codigo: { tipo: t.tipo, codigo: t.codigo } },
            update: { nombre: t.nombre, descripcion: t.descripcion, extra: t.extra, activo: t.activo, orden: t.orden },
            create: { tipo: t.tipo, codigo: t.codigo, nombre: t.nombre, descripcion: t.descripcion, extra: t.extra, activo: t.activo ?? true, orden: t.orden ?? 0 },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.tablasMaestras = data.tablasMaestras.length;
    }

    if (Array.isArray(data.monedas)) {
      for (const m of data.monedas) {
        try {
          await prisma.moneda.upsert({
            where: { codigo: m.codigo },
            update: { nombre: m.nombre, simbolo: m.simbolo, esPorDefecto: m.esPorDefecto, activo: m.activo },
            create: { codigo: m.codigo, nombre: m.nombre, simbolo: m.simbolo, esPorDefecto: m.esPorDefecto ?? false, activo: m.activo ?? true },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.monedas = data.monedas.length;
    }

    if (Array.isArray(data.tiposPago)) {
      for (const t of data.tiposPago) {
        try {
          await prisma.tipoPago.upsert({
            where: { codigo: t.codigo },
            update: { nombre: t.nombre, descripcion: t.descripcion, orden: t.orden, activo: t.activo },
            create: { codigo: t.codigo, nombre: t.nombre, descripcion: t.descripcion, orden: t.orden ?? 0, activo: t.activo ?? true },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.tiposPago = data.tiposPago.length;
    }

    if (Array.isArray(data.seriesFacturacion)) {
      for (const s of data.seriesFacturacion) {
        try {
          await prisma.serieFacturacion.upsert({
            where: { serie: s.serie },
            update: { tipoDocumento: s.tipoDocumento, correlativoActual: s.correlativoActual, correlativoInicial: s.correlativoInicial, activo: s.activo, descripcion: s.descripcion },
            create: { serie: s.serie, tipoDocumento: s.tipoDocumento ?? 'FACTURA', correlativoActual: s.correlativoActual ?? 1, correlativoInicial: s.correlativoInicial ?? 1, activo: s.activo ?? true, descripcion: s.descripcion },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.seriesFacturacion = data.seriesFacturacion.length;
    }

    if (Array.isArray(data.configuraciones)) {
      for (const c of data.configuraciones) {
        try {
          await prisma.configuracion.upsert({
            where: { clave: c.clave },
            update: { valor: c.valor, tipo: c.tipo, categoria: c.categoria, etiqueta: c.etiqueta, descripcion: c.descripcion },
            create: { clave: c.clave, valor: c.valor, tipo: c.tipo ?? 'texto', categoria: c.categoria ?? 'general', etiqueta: c.etiqueta, descripcion: c.descripcion },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.configuraciones = data.configuraciones.length;
    }

    if (Array.isArray(data.configuracionAlertas)) {
      for (const c of data.configuracionAlertas) {
        try {
          await prisma.configuracionAlerta.upsert({
            where: { clave: c.clave },
            update: { etiqueta: c.etiqueta, diasAnticipacion: c.diasAnticipacion, activo: c.activo, color: c.color, nivel: c.nivel },
            create: { clave: c.clave, etiqueta: c.etiqueta, diasAnticipacion: c.diasAnticipacion ?? 30, activo: c.activo ?? true, color: c.color ?? 'yellow', nivel: c.nivel ?? 'warning' },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.configuracionAlertas = data.configuracionAlertas.length;
    }

    if (Array.isArray(data.tiposVehiculo)) {
      for (const t of data.tiposVehiculo) {
        try {
          await prisma.tipoVehiculoConfig.upsert({
            where: { codigo: t.codigo },
            update: { nombre: t.nombre, descripcion: t.descripcion, activo: t.activo },
            create: { codigo: t.codigo, nombre: t.nombre, descripcion: t.descripcion, activo: t.activo ?? true },
          });
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)); }
      }
      resultados.tiposVehiculo = data.tiposVehiculo.length;
    }

    if (errores.length > 0) {
      console.warn('[BACKUP RESTORE] Errores parciales:', errores);
    }
    return { message: 'Backup restaurado correctamente', resultados, errores };
  }
}

export const backupService = new BackupService();
