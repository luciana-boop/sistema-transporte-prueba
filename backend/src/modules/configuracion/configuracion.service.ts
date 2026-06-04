// FILE: src/modules/configuracion/configuracion.service.ts
// CAMBIOS:
//   - DEFAULTS_TABLAS incluye ahora 'unidad_medida' (UND, SERV, VIAJE, KG, TON, GLN)
//     y 'codigo_factura' (00001→Servicio Transporte Nacional, 00002→Transporte Local,
//     00003→Flete Especial)
//   - Nuevos métodos: getUnidadesMedida, getCodigosFactura con filtro activo:true
//   - getUnidadesMedida y getCodigosFactura son los endpoints que consume Facturación
//   - Resto del servicio SIN cambios

import prisma from '../../prisma/client';

// ─── PARÁMETROS GENERALES ─────────────────────────────────────────────────────

const DEFAULTS_CONFIGURACION: Record<string, { valor: string; tipo: string; categoria: string; etiqueta: string; descripcion?: string }> = {
  igv_porcentaje:           { valor: '18',                 tipo: 'numero',   categoria: 'facturacion',  etiqueta: 'IGV (%)',                   descripcion: 'Porcentaje de IGV aplicado a facturas' },
  detraccion_porcentaje:    { valor: '4',                  tipo: 'numero',   categoria: 'facturacion',  etiqueta: 'Detracción default (%)',     descripcion: 'Porcentaje de detracción por defecto' },
  moneda_default:           { valor: 'PEN',                tipo: 'texto',    categoria: 'facturacion',  etiqueta: 'Moneda default',             descripcion: 'PEN, USD, EUR' },
  credito_dias_default:     { valor: '30',                 tipo: 'numero',   categoria: 'facturacion',  etiqueta: 'Días de crédito default',   descripcion: 'Días de crédito cuando no se especifica' },
  empresa_nombre:           { valor: 'Mi Empresa SAC',     tipo: 'texto',    categoria: 'empresa',      etiqueta: 'Nombre empresa',             descripcion: 'Nombre comercial de la empresa' },
  empresa_razon_social:     { valor: 'Mi Empresa SAC',     tipo: 'texto',    categoria: 'empresa',      etiqueta: 'Razón social' },
  empresa_ruc:              { valor: '20000000001',        tipo: 'texto',    categoria: 'empresa',      etiqueta: 'RUC' },
  empresa_direccion:        { valor: 'Av. Principal 123',  tipo: 'texto',    categoria: 'empresa',      etiqueta: 'Dirección' },
  empresa_telefono:         { valor: '01-0000000',         tipo: 'texto',    categoria: 'empresa',      etiqueta: 'Teléfono' },
  empresa_email:            { valor: 'contacto@empresa.com', tipo: 'texto',  categoria: 'empresa',      etiqueta: 'Correo empresa' },
  pdf_pie_pagina:           { valor: 'Gracias por su preferencia', tipo: 'texto', categoria: 'pdf',    etiqueta: 'Pie de página PDF' },
  pdf_texto_legal:          { valor: 'Documento emitido electrónicamente', tipo: 'texto', categoria: 'pdf', etiqueta: 'Texto legal PDF' },
  pdf_color_principal:      { valor: '#2563eb',            tipo: 'color',    categoria: 'pdf',          etiqueta: 'Color principal PDF' },
  pdf_formato_impresion:    { valor: 'A4',                 tipo: 'texto',    categoria: 'pdf',          etiqueta: 'Formato impresión',          descripcion: 'A4, Letter, A5' },
};

const DEFAULTS_ALERTAS = [
  { clave: 'soat_vencimiento',      etiqueta: 'SOAT por vencer',            diasAnticipacion: 30, color: 'yellow', nivel: 'warning' },
  { clave: 'revision_vencimiento',  etiqueta: 'Revisión técnica por vencer', diasAnticipacion: 30, color: 'yellow', nivel: 'warning' },
  { clave: 'licencia_vencimiento',  etiqueta: 'Licencia conductor por vencer', diasAnticipacion: 30, color: 'orange', nivel: 'warning' },
  { clave: 'factura_vencida',       etiqueta: 'Facturas vencidas',          diasAnticipacion: 0,  color: 'red',    nivel: 'danger' },
  { clave: 'mantenimiento_proximo', etiqueta: 'Mantenimiento próximo',      diasAnticipacion: 15, color: 'blue',   nivel: 'info' },
];

const DEFAULTS_CATEGORIAS_GASTO = [
  { codigo: 'PEAJE',        nombre: 'Peaje',         esDefault: true },
  { codigo: 'BALANZA',      nombre: 'Balanza',       esDefault: true },
  { codigo: 'VIATICO',      nombre: 'Viático',       esDefault: true },
  { codigo: 'TOLDO',        nombre: 'Toldo',         esDefault: true },
  { codigo: 'HOSPEDAJE',    nombre: 'Hospedaje',     esDefault: false },
  { codigo: 'LAVADO',       nombre: 'Lavado',        esDefault: false },
  { codigo: 'MECANICO',     nombre: 'Mecánico',      esDefault: false },
  { codigo: 'COMBUSTIBLE',  nombre: 'Combustible',   esDefault: false },
  { codigo: 'OTROS',        nombre: 'Otros',         esDefault: true },
];

const DEFAULTS_TABLAS: Array<{ tipo: string; codigo: string; nombre: string; descripcion?: string; orden?: number }> = [
  // Bancos
  { tipo: 'banco', codigo: 'BCP',   nombre: 'Banco de Crédito del Perú' },
  { tipo: 'banco', codigo: 'BBVA',  nombre: 'BBVA Perú' },
  { tipo: 'banco', codigo: 'INTER', nombre: 'Interbank' },
  { tipo: 'banco', codigo: 'SCO',   nombre: 'Scotiabank' },
  // Tipos pago
  { tipo: 'tipo_pago', codigo: 'EFECTIVO',      nombre: 'Efectivo' },
  { tipo: 'tipo_pago', codigo: 'TRANSFERENCIA', nombre: 'Transferencia bancaria' },
  { tipo: 'tipo_pago', codigo: 'TARJETA',       nombre: 'Tarjeta' },
  { tipo: 'tipo_pago', codigo: 'CHEQUE',        nombre: 'Cheque' },
  // Monedas
  { tipo: 'moneda', codigo: 'PEN', nombre: 'Sol peruano',  descripcion: 'S/' },
  { tipo: 'moneda', codigo: 'USD', nombre: 'Dólar americano', descripcion: '$' },
  // Tipos documento
  { tipo: 'tipo_documento', codigo: 'FACTURA',  nombre: 'Factura' },
  { tipo: 'tipo_documento', codigo: 'BOLETA',   nombre: 'Boleta de venta' },
  { tipo: 'tipo_documento', codigo: 'NC',       nombre: 'Nota de crédito' },
  // Tipos crédito
  { tipo: 'tipo_credito', codigo: '7',  nombre: '7 días' },
  { tipo: 'tipo_credito', codigo: '15', nombre: '15 días' },
  { tipo: 'tipo_credito', codigo: '30', nombre: '30 días' },
  { tipo: 'tipo_credito', codigo: '60', nombre: '60 días' },
  // Tipos carga
  { tipo: 'tipo_carga', codigo: 'GENERAL',     nombre: 'Carga general' },
  { tipo: 'tipo_carga', codigo: 'REFRIGERADA', nombre: 'Carga refrigerada' },
  { tipo: 'tipo_carga', codigo: 'PELIGROSA',   nombre: 'Carga peligrosa' },
  { tipo: 'tipo_carga', codigo: 'GRANEL',      nombre: 'Granel' },
  // Proveedores combustible
  { tipo: 'proveedor_combustible', codigo: 'PRIMAX',  nombre: 'Primax' },
  { tipo: 'proveedor_combustible', codigo: 'REPSOL',  nombre: 'Repsol' },
  { tipo: 'proveedor_combustible', codigo: 'PECSA',   nombre: 'Pecsa' },
  { tipo: 'proveedor_combustible', codigo: 'SHELL',   nombre: 'Shell' },
  // ── NUEVO: Unidades de medida ─────────────────────────────────────────────
  { tipo: 'unidad_medida', codigo: 'UND',   nombre: 'Unidad',    descripcion: 'Unidad genérica',      orden: 1 },
  { tipo: 'unidad_medida', codigo: 'SERV',  nombre: 'Servicio',  descripcion: 'Servicio prestado',    orden: 2 },
  { tipo: 'unidad_medida', codigo: 'VIAJE', nombre: 'Viaje',     descripcion: 'Viaje de transporte',  orden: 3 },
  { tipo: 'unidad_medida', codigo: 'KG',    nombre: 'Kilogramo', descripcion: 'Peso en kilogramos',   orden: 4 },
  { tipo: 'unidad_medida', codigo: 'TON',   nombre: 'Tonelada',  descripcion: 'Peso en toneladas',    orden: 5 },
  { tipo: 'unidad_medida', codigo: 'GLN',   nombre: 'Galón',     descripcion: 'Volumen en galones',   orden: 6 },
  // ── NUEVO: Códigos de facturación ──────────────────────────────────────────
  // 'nombre' = código visible; 'descripcion' = descripción que se autocompleta
  { tipo: 'codigo_factura', codigo: '00001', nombre: '00001', descripcion: 'Servicio de Transporte Nacional', orden: 1 },
  { tipo: 'codigo_factura', codigo: '00002', nombre: '00002', descripcion: 'Transporte Local',                orden: 2 },
  { tipo: 'codigo_factura', codigo: '00003', nombre: '00003', descripcion: 'Flete Especial',                  orden: 3 },
];

const DEFAULTS_SERIES = [
  { serie: 'F001', tipoDocumento: 'FACTURA',  descripcion: 'Facturas principales' },
  { serie: 'F002', tipoDocumento: 'FACTURA',  descripcion: 'Facturas secundarias' },
  { serie: 'B001', tipoDocumento: 'BOLETA',   descripcion: 'Boletas de venta' },
];

export class ConfiguracionService {

  // ── Inicializar defaults (llamar en seed) ───────────────────────────────────
  async inicializarDefaults() {
    // Configuraciones generales
    for (const [clave, def] of Object.entries(DEFAULTS_CONFIGURACION)) {
      await prisma.configuracion.upsert({
        where: { clave },
        update: {},
        create: { clave, ...def },
      });
    }
    // Alertas
    for (const a of DEFAULTS_ALERTAS) {
      await prisma.configuracionAlerta.upsert({
        where: { clave: a.clave },
        update: {},
        create: a,
      });
    }
    // Categorías gasto
    for (const c of DEFAULTS_CATEGORIAS_GASTO) {
      await prisma.categoriaGasto.upsert({
        where: { codigo: c.codigo },
        update: {},
        create: c,
      });
    }
    // Tablas maestras (incluye unidad_medida y codigo_factura)
    for (const t of DEFAULTS_TABLAS) {
      await prisma.tablaMaestra.upsert({
        where: { tipo_codigo: { tipo: t.tipo, codigo: t.codigo } },
        update: {},
        create: t,
      });
    }
    // Series de facturación
    for (const s of DEFAULTS_SERIES) {
      await prisma.serieFacturacion.upsert({
        where: { serie: s.serie },
        update: {},
        create: s,
      });
    }
    return { message: 'Defaults inicializados correctamente' };
  }

  // ── Parámetros generales ────────────────────────────────────────────────────
  async getParametros() {
    const configs = await prisma.configuracion.findMany({ orderBy: [{ categoria: 'asc' }, { etiqueta: 'asc' }] });
    // Group by category
    const grouped: Record<string, typeof configs> = {};
    for (const c of configs) {
      if (!grouped[c.categoria]) grouped[c.categoria] = [];
      grouped[c.categoria].push(c);
    }
    return grouped;
  }

  async getParametro(clave: string) {
    const c = await prisma.configuracion.findUnique({ where: { clave } });
    return c?.valor ?? DEFAULTS_CONFIGURACION[clave]?.valor ?? null;
  }

  async updateParametro(clave: string, valor: string) {
    return prisma.configuracion.upsert({
      where: { clave },
      update: { valor },
      create: {
        clave,
        ...(DEFAULTS_CONFIGURACION[clave] || { tipo: 'texto', categoria: 'general', etiqueta: clave }),
        valor,
      },
    });
  }

  async updateParametrosBulk(params: Record<string, string>) {
    const updates = Object.entries(params).map(([clave, valor]) => this.updateParametro(clave, valor));
    await Promise.all(updates);
    return { message: 'Parámetros actualizados', cantidad: Object.keys(params).length };
  }

  // ── Series de facturación ───────────────────────────────────────────────────
  async getSeries() {
    return prisma.serieFacturacion.findMany({ orderBy: { serie: 'asc' } });
  }

  async getSeriesActivas() {
    return prisma.serieFacturacion.findMany({ where: { activo: true }, orderBy: { serie: 'asc' } });
  }

  async getSerie(serie: string) {
    const s = await prisma.serieFacturacion.findUnique({ where: { serie } });
    if (!s) throw new Error('Serie no encontrada');
    return s;
  }

  async createSerie(dto: { serie: string; tipoDocumento?: string; correlativoInicial?: number; descripcion?: string }) {
    const existe = await prisma.serieFacturacion.findUnique({ where: { serie: dto.serie.toUpperCase() } });
    if (existe) throw new Error(`La serie ${dto.serie} ya existe`);
    return prisma.serieFacturacion.create({
      data: {
        serie: dto.serie.toUpperCase(),
        tipoDocumento: dto.tipoDocumento || 'FACTURA',
        correlativoInicial: dto.correlativoInicial || 1,
        correlativoActual: dto.correlativoInicial || 1,
        descripcion: dto.descripcion,
      },
    });
  }

  async updateSerie(id: number, dto: { tipoDocumento?: string; correlativoActual?: number; activo?: boolean; descripcion?: string }) {
    const serie = await prisma.serieFacturacion.findUnique({ where: { id } });
    if (!serie) throw new Error('Serie no encontrada');
    return prisma.serieFacturacion.update({ where: { id }, data: dto });
  }

  async deleteSerie(id: number) {
    const serie = await prisma.serieFacturacion.findUnique({ where: { id } });
    if (!serie) throw new Error('Serie no encontrada');
    // Check if it has facturas
    const facturas = await prisma.factura.count({ where: { serie: serie.serie } });
    if (facturas > 0) throw new Error(`La serie ${serie.serie} tiene ${facturas} facturas y no puede eliminarse`);
    return prisma.serieFacturacion.delete({ where: { id } });
  }

  async incrementarCorrelativo(serie: string): Promise<number> {
    const s = await prisma.serieFacturacion.findUnique({ where: { serie } });
    if (s) {
      const siguiente = s.correlativoActual + 1;
      await prisma.serieFacturacion.update({ where: { serie }, data: { correlativoActual: siguiente } });
      return s.correlativoActual;
    }
    // Fallback to counting facturas
    const ultima = await prisma.factura.findFirst({ where: { serie }, orderBy: { correlativo: 'desc' }, select: { correlativo: true } });
    return (ultima?.correlativo ?? 0) + 1;
  }

  // ── Categorías de gasto ─────────────────────────────────────────────────────
  async getCategoriasGasto() {
    return prisma.categoriaGasto.findMany({ orderBy: { nombre: 'asc' } });
  }

  async createCategoriaGasto(dto: { codigo: string; nombre: string; descripcion?: string }) {
    const existe = await prisma.categoriaGasto.findUnique({ where: { codigo: dto.codigo.toUpperCase() } });
    if (existe) throw new Error(`El código ${dto.codigo} ya existe`);
    return prisma.categoriaGasto.create({ data: { ...dto, codigo: dto.codigo.toUpperCase() } });
  }

  async updateCategoriaGasto(id: number, dto: { nombre?: string; descripcion?: string; activo?: boolean }) {
    const c = await prisma.categoriaGasto.findUnique({ where: { id } });
    if (!c) throw new Error('Categoría no encontrada');
    return prisma.categoriaGasto.update({ where: { id }, data: dto });
  }

  async deleteCategoriaGasto(id: number) {
    const c = await prisma.categoriaGasto.findUnique({ where: { id } });
    if (!c) throw new Error('Categoría no encontrada');
    if (c.esDefault) throw new Error('No se pueden eliminar categorías del sistema');
    return prisma.categoriaGasto.delete({ where: { id } });
  }

  // ── Alertas ─────────────────────────────────────────────────────────────────
  async getAlertas() {
    return prisma.configuracionAlerta.findMany({ orderBy: { etiqueta: 'asc' } });
  }

  async updateAlerta(id: number, dto: { diasAnticipacion?: number; activo?: boolean; color?: string; nivel?: string }) {
    const a = await prisma.configuracionAlerta.findUnique({ where: { id } });
    if (!a) throw new Error('Alerta no encontrada');
    return prisma.configuracionAlerta.update({ where: { id }, data: dto });
  }

  async updateAlertasBulk(alertas: Array<{ id: number; diasAnticipacion: number; activo: boolean; color: string; nivel: string }>) {
    const updates = alertas.map((a) =>
      prisma.configuracionAlerta.update({ where: { id: a.id }, data: { diasAnticipacion: a.diasAnticipacion, activo: a.activo, color: a.color, nivel: a.nivel } })
    );
    await Promise.all(updates);
    return { message: 'Alertas actualizadas', cantidad: alertas.length };
  }

  // ── Tablas maestras ─────────────────────────────────────────────────────────
  async getTablaMaestra(tipo: string) {
    return prisma.tablaMaestra.findMany({ where: { tipo }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
  }

  async getTodosTipos() {
    const tipos = await prisma.tablaMaestra.findMany({ distinct: ['tipo'], select: { tipo: true } });
    return tipos.map((t: any) => t.tipo);
  }

  async createTablaMaestra(dto: { tipo: string; codigo: string; nombre: string; descripcion?: string; extra?: string; orden?: number }) {
    // Validar campo obligatorio
    if (!dto.codigo?.trim()) throw new Error('El código es obligatorio');
    if (!dto.nombre?.trim()) throw new Error('El nombre es obligatorio');

    // Validar unicidad por tipo+codigo
    const existe = await prisma.tablaMaestra.findUnique({ where: { tipo_codigo: { tipo: dto.tipo, codigo: dto.codigo } } });
    if (existe) throw new Error(`El código "${dto.codigo}" ya existe en "${dto.tipo}"`);

    return prisma.tablaMaestra.create({ data: dto });
  }

  async updateTablaMaestra(id: number, dto: { nombre?: string; descripcion?: string; extra?: string; activo?: boolean; orden?: number }) {
    const t = await prisma.tablaMaestra.findUnique({ where: { id } });
    if (!t) throw new Error('Registro no encontrado');
    return prisma.tablaMaestra.update({ where: { id }, data: dto });
  }

  async deleteTablaMaestra(id: number) {
    const t = await prisma.tablaMaestra.findUnique({ where: { id } });
    if (!t) throw new Error('Registro no encontrado');
    return prisma.tablaMaestra.delete({ where: { id } });
  }

  // ── Unidades de medida (endpoint específico para Facturación) ───────────────
  // Devuelve solo las activas, ordenadas, para usar como lista desplegable.
  async getUnidadesMedida() {
    return prisma.tablaMaestra.findMany({
      where: { tipo: 'unidad_medida', activo: true },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
      select: { id: true, codigo: true, nombre: true, descripcion: true, activo: true },
    });
  }

  // ── Códigos de facturación (endpoint específico para Facturación) ───────────
  // Devuelve solo los activos. El campo 'descripcion' se usa para autocompletar.
  async getCodigosFactura() {
    return prisma.tablaMaestra.findMany({
      where: { tipo: 'codigo_factura', activo: true },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
      select: { id: true, codigo: true, nombre: true, descripcion: true, activo: true },
    });
  }

  // ── Tipos vehículo ──────────────────────────────────────────────────────────
  async getTiposVehiculo() {
    return prisma.tipoVehiculoConfig.findMany({ orderBy: { nombre: 'asc' } });
  }

  async createTipoVehiculo(dto: { codigo: string; nombre: string; descripcion?: string }) {
    const existe = await prisma.tipoVehiculoConfig.findUnique({ where: { codigo: dto.codigo.toUpperCase() } });
    if (existe) throw new Error(`El código ${dto.codigo} ya existe`);
    return prisma.tipoVehiculoConfig.create({ data: { ...dto, codigo: dto.codigo.toUpperCase() } });
  }

  async updateTipoVehiculo(id: number, dto: { nombre?: string; descripcion?: string; activo?: boolean }) {
    const t = await prisma.tipoVehiculoConfig.findUnique({ where: { id } });
    if (!t) throw new Error('Tipo no encontrado');
    return prisma.tipoVehiculoConfig.update({ where: { id }, data: dto });
  }

  async deleteTipoVehiculo(id: number) {
    await prisma.tipoVehiculoConfig.findUniqueOrThrow({ where: { id } }).catch(() => { throw new Error('Tipo no encontrado'); });
    return prisma.tipoVehiculoConfig.delete({ where: { id } });
  }
}

export const configuracionService = new ConfiguracionService();
