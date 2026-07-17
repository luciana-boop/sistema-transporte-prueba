// FILE: src/modules/guias/guias.service.ts
// Módulo de Guías de Remisión electrónicas (SUNAT GRE), portado de MONKSAAS.
// Adaptaciones a este sistema (single-tenant, sin módulo Ventas/Productos):
//   - sin empresaId/tenant-context: los datos del emisor salen de Configuración
//   - el origen del traslado es un Pedido (no existe Venta)
//   - los detalles son texto libre (no hay Producto/Servicio)
//   - el envío automático a SUNAT se activa con el parámetro
//     "envio_automatico_sunat" = 'true' (por defecto la guía queda pendiente
//     y se envía manualmente desde el listado/detalle)

import prisma from '../../prisma/client';
import { paginar, PaginacionQuery } from '../../utils/pagination';
import { fechaHoraSunat } from '../../utils/horario';
import { configuracionService } from '../configuracion/configuracion.service';
import {
  enviarGuiaSunat,
  consultarEstadoGuiaSunat,
  guardarBase64,
  TIPO_DOC_IDENTIDAD_SUNAT,
} from '../../integraciones/sunat.client';

// Catálogo SUNAT 61 (documentos relacionados a la GRE) — subconjunto que
// puede sustentar un traslado: Factura, Boleta o Guía de Remisión Remitente.
const DOC_RELACIONADO_DESC: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta de Venta',
  '09': 'Guía de Remisión Remitente',
};

export interface GuiaDetalleDto {
  descripcion: string;
  cantidad: number;
  unidadMedida?: string;
}

export interface TransportistaAdicionalDto {
  placa: string;
  numRegistroMTC: string;
}

export interface CreateGuiaDto {
  // Origen del traslado: pedido de transporte (opcional).
  pedidoId?: number;
  // Exactamente uno de clienteId o (clienteNombre + clienteNumDoc).
  // Destinatario de la mercadería en ambos tipoGuia.
  clienteId?: number;
  clienteNombre?: string;
  clienteNumDoc?: string;
  serie?: string;
  // Catálogo SUNAT 01: '09' Guía Remitente (default) | '31' Guía Transportista.
  // En Transportista, clienteId sigue siendo el destinatario, pero además
  // remitenteId es obligatorio (ninguna de las dos partes emite la guía).
  tipoGuia?: 'REMITENTE' | 'TRANSPORTISTA';
  remitenteId?: number;
  // SUNAT transport fields
  motivoTraslado?: string;
  modalidadTransporte?: string;
  fechaInicioTraslado?: string;
  ubigeoOrigen?: string;
  direccionPartida?: string;
  ubigeoDestino?: string;
  direccionEntrega?: string;
  // Transportista público
  rucTransportista?: string;
  razonSocialTransportista?: string;
  numRegistroMTC?: string;
  placaTransportista?: string;
  // Modalidad pública (01): placas/MTC adicionales más allá del transportista principal
  transportistasAdicionales?: TransportistaAdicionalDto[];
  // Conductor/vehículo privado (tracto + carreta opcional)
  conductorId?: number;
  vehiculoId?: number;
  vehiculoCarretaId?: number;
  conductorNombre?: string;
  conductorDni?: string;
  conductorLicencia?: string;
  pesoTotal?: number;
  observaciones?: string;
  // Documento relacionado (catálogo SUNAT 61) — obligatorio en Guía
  // Transportista: '09' Guía Remitente del remitente, o '01'/'03'
  // Factura/Boleta si el remitente no emite GRE-Remitente.
  docRelTipo?: string;
  docRelSerie?: string;
  docRelNumero?: string;
  docRelRucEmisor?: string;
  detalles: GuiaDetalleDto[];
}

// Formulario reducido para el rol CHOFER: siempre guía Transportista (31) —
// la empresa transporta carga de terceros, no propia — modalidad privada,
// con conductor tomado de Usuario.conductorId (nunca del body). El origen cae
// en la dirección de la empresa (Configuración) solo si el chofer no indica
// una dirección de partida — ver crearParaChofer().
export interface CrearGuiaChoferDto {
  // Remitente: quien origina el traslado (tercero, obligatorio en Transportista).
  remitenteId: number;
  clienteId?: number;
  clienteNombre?: string;
  clienteNumDoc?: string;
  fechaInicioTraslado?: string;
  ubigeoOrigen?: string;
  direccionPartida?: string;
  ubigeoDestino?: string;
  direccionEntrega?: string;
  vehiculoId: number;
  vehiculoCarretaId?: number;
  pesoTotal?: number;
  observaciones?: string;
  // Documento relacionado (catálogo SUNAT 61) — obligatorio en Transportista.
  docRelTipo: string;
  docRelSerie?: string;
  docRelNumero: string;
  docRelRucEmisor: string;
  detalles: GuiaDetalleDto[];
}

// Tipo de documento de identidad SUNAT inferido del número: 11 dígitos = RUC (6),
// otro caso = DNI (1). Este sistema no guarda tipoDocumento en Cliente.
function tipoDocPorNumero(numDoc: string | null | undefined): string {
  return numDoc && numDoc.length === 11 ? TIPO_DOC_IDENTIDAD_SUNAT.RUC : TIPO_DOC_IDENTIDAD_SUNAT.DNI;
}

// Exactamente uno de clienteId o (clienteNombre + clienteNumDoc) — mismo
// contrato que en MONKSAAS (cliente-libre.util.ts).
async function validarClienteLibre(dto: { clienteId?: number; clienteNombre?: string; clienteNumDoc?: string }): Promise<void> {
  const tieneCliente = !!dto.clienteId;
  const tieneLibre = !!(dto.clienteNombre && dto.clienteNumDoc);
  if (tieneCliente === tieneLibre) {
    throw new Error('Indique un cliente registrado o nombre + documento (DNI), no ambos ni ninguno');
  }
  if (dto.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');
  }
}

export const guiasService = {
  async listar(query: {
    clienteId?: string; pedidoId?: string; estado?: string; search?: string;
    desde?: string; hasta?: string;
  } & PaginacionQuery) {
    const where: any = { anulado: false };
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.pedidoId) where.pedidoId = parseInt(query.pedidoId);
    if (query.estado) where.estado = query.estado;
    if (query.desde || query.hasta) {
      where.fechaEmision = {};
      if (query.desde) where.fechaEmision.gte = new Date(query.desde);
      if (query.hasta) where.fechaEmision.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.search) {
      where.OR = [
        { numero: { contains: query.search } },
        { cliente: { razonSocial: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.guia.count({ where }),
      prisma.guia.findMany({
        where, skip, take,
        orderBy: { creadoEn: 'desc' },
        include: {
          cliente:   { select: { id: true, razonSocial: true, ruc: true } },
          remitente: { select: { id: true, razonSocial: true, ruc: true } },
          pedido:    { select: { id: true, origen: true, destino: true, tipoCarga: true } },
          factura:   { select: { id: true, numeroFactura: true } },
          usuario:   { select: { id: true, nombre: true } },
          conductor: { select: { id: true, nombre: true, dni: true, licencia: true } },
          vehiculo:  { select: { id: true, placa: true, marca: true, modelo: true } },
          vehiculoCarreta: { select: { id: true, placa: true, marca: true, modelo: true } },
          _count:    { select: { detalles: true } },
        },
      }),
    ]);
    return { items, total, page, limit };
  },

  async obtener(id: number) {
    const guia = await prisma.guia.findUnique({
      where: { id },
      include: {
        cliente:   true,
        remitente: true,
        pedido:    { select: { id: true, origen: true, destino: true, tipoCarga: true, tarifa: true } },
        factura:   { select: { id: true, numeroFactura: true, estado: true } },
        usuario:   { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true } },
        actualizadoPor: { select: { id: true, nombre: true } },
        conductor: { select: { id: true, nombre: true, dni: true, licencia: true } },
        vehiculo:  { select: { id: true, placa: true, marca: true, modelo: true } },
        vehiculoCarreta: { select: { id: true, placa: true, marca: true, modelo: true } },
        transportistasAdicionales: true,
        detalles: true,
      },
    });
    if (!guia) throw new Error('Guía no encontrada');
    return guia;
  },

  // Genera el siguiente correlativo de una serie (tipoDocumento = 'GUIA'), incrementando
  // SerieFacturacion.correlativoActual dentro de la transacción dada. Si la serie no está
  // configurada en Configuración, calcula un correlativo de respaldo a partir de la última
  // guía emitida con esa serie (mismo patrón de fallback que facturacionService.getSeries()).
  async _siguienteCorrelativo(tx: any, serie: string): Promise<number> {
    const serieConfig = await tx.serieFacturacion.findUnique({ where: { serie } });
    if (serieConfig) {
      await tx.serieFacturacion.update({
        where: { id: serieConfig.id },
        data: { correlativoActual: { increment: 1 } },
      });
      return serieConfig.correlativoActual;
    }
    const ultima = await tx.guia.findFirst({
      where: { serie },
      orderBy: { id: 'desc' },
      select: { numero: true },
    });
    const match = ultima?.numero?.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) + 1 : 1;
  },

  async crear(dto: CreateGuiaDto, usuarioId: number) {
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new Error('La guía debe tener al menos un detalle');
    }

    const tipoGuia = dto.tipoGuia ?? 'REMITENTE';

    await validarClienteLibre(dto);
    const cliente = dto.clienteId
      ? await prisma.cliente.findUnique({ where: { id: dto.clienteId } })
      : null;

    // Guía Transportista (catálogo SUNAT 31): la empresa emisora es la
    // transportista, no el remitente ni el destinatario — ambas partes son
    // obligatorias, y al ser ella quien transporta, los datos de conductor y
    // vehículo también lo son (sin distinción de modalidad pública/privada).
    if (tipoGuia === 'TRANSPORTISTA') {
      if (!dto.remitenteId) throw new Error('El remitente es obligatorio en una guía de tipo Transportista');
      const remitente = await prisma.cliente.findUnique({ where: { id: dto.remitenteId } });
      if (!remitente) throw new Error('Remitente no encontrado');

      const tieneConductor = !!dto.conductorId || !!(dto.conductorNombre && dto.conductorDni && dto.conductorLicencia);
      const tieneVehiculo = !!dto.vehiculoId || !!dto.placaTransportista;
      if (!tieneConductor || !tieneVehiculo) {
        throw new Error('Los datos de conductor y vehículo son obligatorios en una guía de tipo Transportista');
      }

      // SUNAT: "cuando corresponda la emisión de la guía de remisión
      // remitente, se consignará el número y serie de la misma o
      // comprobante de pago, que puedan sustentar el traslado" — el
      // remitente es un tercero externo a este sistema, así que se pide a
      // mano en vez de resolverlo de una relación.
      if (!dto.docRelTipo || !dto.docRelNumero || !dto.docRelRucEmisor) {
        throw new Error('El documento relacionado (tipo, número y RUC del emisor) es obligatorio en una guía de tipo Transportista');
      }
    }

    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({ where: { id: dto.pedidoId } });
      if (!pedido) throw new Error('Pedido no encontrado');
      if (pedido.estado === 'ANULADO') throw new Error('No se puede generar una guía para un pedido anulado');
      if (dto.clienteId && pedido.clienteId !== dto.clienteId) {
        throw new Error('El pedido no pertenece al cliente seleccionado');
      }
    }

    if (dto.conductorId) {
      const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
      if (!conductor) throw new Error('Conductor no encontrado');
    }

    if (dto.vehiculoId) {
      const vehiculo = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoId } });
      if (!vehiculo) throw new Error('Vehículo no encontrado');
    }

    if (dto.vehiculoCarretaId) {
      const carreta = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoCarretaId } });
      if (!carreta) throw new Error('Carreta no encontrada');
      if (carreta.tipo !== 'CARRETA') throw new Error('El vehículo seleccionado como carreta no es de tipo CARRETA');
    }

    // Autocompletar origen/destino — siguen siendo editables desde el DTO,
    // esto es solo el valor por defecto cuando no llegan.
    const direccionEmpresa = await configuracionService.getParametro('empresa_direccion');
    const direccionPartida = dto.direccionPartida ?? direccionEmpresa ?? undefined;
    const ubigeoOrigen = dto.ubigeoOrigen ?? undefined;
    const direccionEntrega = dto.direccionEntrega ?? cliente?.direccion ?? undefined;
    const ubigeoDestino = dto.ubigeoDestino ?? cliente?.ubigeo ?? undefined;

    const serie = (dto.serie || 'GUI1').toUpperCase();
    // Solo se aceptan transportistas adicionales en modalidad pública (01).
    const transportistasAdicionales = dto.modalidadTransporte === '01' ? (dto.transportistasAdicionales ?? []) : [];

    const intentarCrear = async () => prisma.$transaction(async (tx: any) => {
      const correlativo = await this._siguienteCorrelativo(tx, serie);
      const numero = `${serie}-${String(correlativo).padStart(5, '0')}`;

      return tx.guia.create({
        data: {
          numero,
          serie,
          clienteId: dto.clienteId,
          clienteNombre: dto.clienteNombre,
          clienteNumDoc: dto.clienteNumDoc,
          remitenteId: tipoGuia === 'TRANSPORTISTA' ? dto.remitenteId : undefined,
          tipoGuia,
          pedidoId: dto.pedidoId,
          usuarioId,
          creadoPorId: usuarioId,
          motivoTraslado: dto.motivoTraslado ?? '01',
          modalidadTransporte: dto.modalidadTransporte ?? '02',
          // dto.fechaInicioTraslado llega como "YYYY-MM-DD" (input type=date,
          // sin hora). new Date("YYYY-MM-DD") lo ancla a medianoche UTC, no
          // medianoche Peru -- al mostrarlo despues en hora local (navegador
          // en Lima, PDF, etc.) aparece un dia antes ("ayer"). Anclar
          // explicitamente a medianoche Peru (-05:00) evita el corrimiento.
          fechaInicioTraslado: dto.fechaInicioTraslado ? new Date(`${dto.fechaInicioTraslado}T00:00:00-05:00`) : undefined,
          ubigeoOrigen,
          direccionPartida,
          ubigeoDestino,
          direccionEntrega,
          rucTransportista: dto.rucTransportista,
          razonSocialTransportista: dto.razonSocialTransportista,
          numRegistroMTC: dto.numRegistroMTC,
          placaTransportista: dto.placaTransportista,
          conductorId: dto.conductorId,
          vehiculoId: dto.vehiculoId,
          vehiculoCarretaId: dto.vehiculoCarretaId,
          conductorNombre: dto.conductorNombre,
          conductorDni: dto.conductorDni,
          conductorLicencia: dto.conductorLicencia,
          pesoTotal: dto.pesoTotal,
          observaciones: dto.observaciones,
          docRelTipo: tipoGuia === 'TRANSPORTISTA' ? dto.docRelTipo : undefined,
          docRelSerie: tipoGuia === 'TRANSPORTISTA' ? dto.docRelSerie : undefined,
          docRelNumero: tipoGuia === 'TRANSPORTISTA' ? dto.docRelNumero : undefined,
          docRelRucEmisor: tipoGuia === 'TRANSPORTISTA' ? dto.docRelRucEmisor : undefined,
          detalles: {
            create: dto.detalles.map((d) => ({
              descripcion: d.descripcion,
              cantidad: d.cantidad,
              unidadMedida: d.unidadMedida ?? 'NIU',
            })),
          },
          transportistasAdicionales: transportistasAdicionales.length > 0 ? {
            create: transportistasAdicionales.map((t) => ({ placa: t.placa, numRegistroMTC: t.numRegistroMTC })),
          } : undefined,
        },
        include: {
          detalles: true,
          transportistasAdicionales: true,
          conductor: { select: { id: true, nombre: true, dni: true, licencia: true } },
          vehiculo:  { select: { id: true, placa: true, marca: true, modelo: true } },
          vehiculoCarreta: { select: { id: true, placa: true, marca: true, modelo: true } },
          remitente: { select: { id: true, razonSocial: true, ruc: true } },
        },
      });
    });

    let guia;
    try {
      guia = await intentarCrear();
    } catch (e: any) {
      // Colisión de número por creación concurrente con la misma serie — un solo reintento.
      if (e.code !== 'P2002') throw e;
      guia = await intentarCrear();
    }

    // Envío a SUNAT asíncrono — no bloquea la respuesta HTTP de creación.
    // Solo si "envio_automatico_sunat" = 'true'; en otro caso la guía queda
    // emitida pero sin enviar (estadoSunat null) hasta que se envíe
    // manualmente (ver reenviarSunat/enviarLoteSunat).
    if ((await configuracionService.getParametro('envio_automatico_sunat')) === 'true') {
      this._enviarASunat(guia.id).catch((err: unknown) => {
        console.error(`[SUNAT] Fallo no controlado al enviar guía ${guia.id}:`, err);
      });
    }

    return guia;
  },

  // Crea una guía desde el formulario reducido de chofer (rol CHOFER, ver
  // guias-chofer.routes.ts). El conductor sale de Usuario.conductorId — nunca
  // del body — para que un chofer no pueda emitir guías a nombre de otro.
  // Reusa crear() íntegramente: mismas validaciones, correlativo y envío a SUNAT.
  async crearParaChofer(usuarioId: number, dto: CrearGuiaChoferDto) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { conductorId: true } });
    if (!usuario?.conductorId) {
      throw new Error('Tu cuenta no está vinculada a un conductor. Contactá al administrador.');
    }
    if (!dto.vehiculoId) {
      throw new Error('Debe seleccionar un vehículo (tracto)');
    }

    return this.crear({
      tipoGuia: 'TRANSPORTISTA',
      modalidadTransporte: '02',
      conductorId: usuario.conductorId,
      remitenteId: dto.remitenteId,
      clienteId: dto.clienteId,
      clienteNombre: dto.clienteNombre,
      clienteNumDoc: dto.clienteNumDoc,
      fechaInicioTraslado: dto.fechaInicioTraslado,
      ubigeoOrigen: dto.ubigeoOrigen,
      direccionPartida: dto.direccionPartida,
      ubigeoDestino: dto.ubigeoDestino,
      direccionEntrega: dto.direccionEntrega,
      vehiculoId: dto.vehiculoId,
      vehiculoCarretaId: dto.vehiculoCarretaId,
      pesoTotal: dto.pesoTotal,
      observaciones: dto.observaciones,
      docRelTipo: dto.docRelTipo,
      docRelSerie: dto.docRelSerie,
      docRelNumero: dto.docRelNumero,
      docRelRucEmisor: dto.docRelRucEmisor,
      detalles: dto.detalles,
    }, usuarioId);
  },

  // Historial acotado a las guías que el propio chofer creó.
  async misGuias(usuarioId: number, query: PaginacionQuery = {}) {
    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.guia.count({ where: { usuarioId } }),
      prisma.guia.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'desc' },
        skip, take,
        select: {
          id: true,
          numero: true,
          fechaEmision: true,
          estado: true,
          estadoSunat: true,
          motivoRechazoSunat: true,
          anulado: true,
          cliente: { select: { razonSocial: true } },
          clienteNombre: true,
        },
      }),
    ]);
    return { items, total, page, limit };
  },

  // Envía la guía recién emitida al servicio de facturación electrónica. GRE es
  // asíncrono: esta llamada solo confirma la recepción y devuelve un ticket
  // (numTicket) — el resultado final (XML/CDR) llega más tarde, vía
  // _procesarTicketsPendientes().
  async _enviarASunat(guiaId: number): Promise<void> {
    const [guia, empresaRuc, empresaRazonSocial] = await Promise.all([
      prisma.guia.findUnique({
        where: { id: guiaId },
        include: {
          cliente: true,
          remitente: true,
          detalles: true,
          conductor: true,
          vehiculo: true,
          transportistasAdicionales: true,
        },
      }),
      configuracionService.getParametro('empresa_ruc'),
      configuracionService.getParametro('empresa_razon_social'),
    ]);
    if (!guia) return;

    // fechaHoraSunat() extrae el dia calendario en hora de Peru en vez de
    // usar .toISOString() (que da UTC). Para fechaEmision (instante real,
    // con hora) esto evita el corrimiento a "mañana" cerca de medianoche.
    // Para fechaInicioTraslado, que ya se ancla a medianoche Peru al
    // parsearse (ver crear()), extraer el dia en hora Peru sigue dando el
    // dia correcto -- no reintroduce el bug de "ayer".
    const fechaISO = (d: Date | null | undefined) => fechaHoraSunat(d ?? guia.fechaEmision).fecha;
    const serie = guia.serie ?? '';
    const numero = serie && guia.numero.startsWith(`${serie}-`) ? guia.numero.slice(serie.length + 1) : guia.numero;

    const payload = {
      remitente: {
        ruc: empresaRuc,
        razon_social: empresaRazonSocial,
      },
      // Destinatario: Cliente registrado, o ingreso libre (DNI) sin Cliente.
      destinatario: guia.cliente
        ? {
            codigo_tipo_entidad: tipoDocPorNumero(guia.cliente.ruc),
            numero_documento: guia.cliente.ruc,
            razon_social_nombres: guia.cliente.razonSocial,
          }
        : {
            codigo_tipo_entidad: tipoDocPorNumero(guia.clienteNumDoc),
            numero_documento: guia.clienteNumDoc,
            razon_social_nombres: guia.clienteNombre,
          },
      envio: {
        serie,
        numero,
        fecha_emision: fechaISO(guia.fechaEmision),
        observaciones: guia.observaciones ?? undefined,
        motivo_traslado: guia.motivoTraslado,
        peso_total_kg: guia.pesoTotal ? Number(guia.pesoTotal) : 0,
        modalidad_transporte: guia.modalidadTransporte,
        fecha_inicio_traslado: fechaISO(guia.fechaInicioTraslado),
        transportista_ruc: guia.modalidadTransporte === '01' ? (guia.rucTransportista ?? undefined) : undefined,
        transportista_razon_social: guia.modalidadTransporte === '01' ? (guia.razonSocialTransportista ?? undefined) : undefined,
        conductor_numero_doc: guia.conductor?.dni ?? guia.conductorDni ?? undefined,
        conductor_tipo_doc: '1',
        vehiculo_placa: guia.vehiculo?.placa ?? guia.placaTransportista ?? undefined,
        ubigeo_destino: guia.ubigeoDestino ?? undefined,
        direccion_destino: guia.direccionEntrega ?? undefined,
        ubigeo_origen: guia.ubigeoOrigen ?? undefined,
        direccion_origen: guia.direccionPartida ?? undefined,
        // Documento relacionado (catálogo 61) — solo aplica en Guía
        // Transportista, ver validación en crear().
        doc_relacionado: guia.docRelTipo && guia.docRelNumero
          ? {
              tipo: guia.docRelTipo,
              tipo_desc: DOC_RELACIONADO_DESC[guia.docRelTipo] ?? guia.docRelTipo,
              numero: guia.docRelSerie ? `${guia.docRelSerie}-${guia.docRelNumero}` : guia.docRelNumero,
              emisor_ruc: guia.docRelRucEmisor ?? undefined,
            }
          : undefined,
      },
      items: guia.detalles.map((d: any) => ({
        descripcion: d.descripcion,
        cantidad: Number(d.cantidad),
        unidad_medida: d.unidadMedida,
      })),
      // '09' Remitente | '31' Transportista (catálogo SUNAT 01).
      tipo_documento: guia.tipoGuia === 'TRANSPORTISTA' ? '31' : '09',
      // Solo en tipo 31: remitente de la mercadería (tercero distinto de
      // quien emite, la propia transportista) — obligatorio para esa GRE.
      remitente_tercero: guia.tipoGuia === 'TRANSPORTISTA' && guia.remitente
        ? {
            codigo_tipo_entidad: tipoDocPorNumero(guia.remitente.ruc),
            numero_documento: guia.remitente.ruc,
            razon_social_nombres: guia.remitente.razonSocial,
          }
        : undefined,
    };

    try {
      const resultado = await enviarGuiaSunat(payload);
      const xmlPath = resultado.xml_base64
        ? (await guardarBase64(resultado.xml_base64, `guias/${guiaId}/xml.xml`)) ?? undefined
        : undefined;
      await prisma.guia.update({
        where: { id: guiaId },
        data: {
          estadoSunat: resultado.estadoSunat,
          ticketSunat: resultado.numTicket,
          ...(xmlPath ? { xmlPath } : {}),
        },
      });
    } catch (err) {
      console.error(`[SUNAT] Error enviando guía ${guia.numero}:`, err);
      await prisma.guia.update({
        where: { id: guiaId },
        data: {
          estadoSunat: 'ERROR_ENVIO',
          motivoRechazoSunat: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
    }
  },

  // Job de polling: recorre guías con ticket SUNAT pendiente y consulta su
  // estado final. GRE no devuelve el resultado en la llamada de envío — hay
  // que seguir preguntando hasta que SUNAT termine de procesar el ticket.
  // Pensado para invocarse periódicamente (ver server.ts).
  async _procesarTicketsPendientes(): Promise<void> {
    const pendientes = await prisma.guia.findMany({
      where: { estadoSunat: 'ENVIADO_PENDIENTE', ticketSunat: { not: null }, anulado: false },
    });
    if (pendientes.length === 0) return;

    const empresaRuc = await configuracionService.getParametro('empresa_ruc');

    for (const guia of pendientes) {
      try {
        const resultado = await consultarEstadoGuiaSunat({
          credenciales: { ruc: empresaRuc },
          numTicket: guia.ticketSunat,
        });

        if (!resultado.procesado) continue;

        // SUNAT rechazó la guía: no tiene validez legal, así que se anula
        // automáticamente — no existe "reintentar" para una guía ya rechazada.
        const rechazada = resultado.estadoSunat === 'RECHAZADO';
        const cdrPath = resultado.cdr_base64
          ? (await guardarBase64(resultado.cdr_base64, `guias/${guia.id}/cdr.zip`)) ?? undefined
          : undefined;

        await prisma.guia.update({
          where: { id: guia.id },
          data: {
            estadoSunat: resultado.estadoSunat,
            motivoRechazoSunat: resultado.respuesta_sunat_descripcion ?? resultado.error ?? undefined,
            cdrPath,
            ...(rechazada ? { anulado: true, estado: 'ANULADA' } : {}),
          },
        });
      } catch (err) {
        console.error(`[SUNAT] Error consultando ticket de guía ${guia.numero}:`, err);
      }
    }
  },

  async anular(id: number) {
    const guia = await this.obtener(id);
    if (guia.anulado) throw new Error('La guía ya fue anulada');
    return prisma.guia.update({ where: { id }, data: { anulado: true, estado: 'ANULADA' } });
  },

  async vincularFactura(id: number, facturaId: number) {
    const guia = await this.obtener(id);
    if (guia.anulado) throw new Error('La guía está anulada');
    const factura = await prisma.factura.findUnique({ where: { id: facturaId } });
    if (!factura) throw new Error('Factura no encontrada');
    return prisma.guia.update({ where: { id }, data: { facturaId } });
  },

  // Vincula manualmente una guía (típicamente creada por un chofer, sin
  // pedido de origen) con un pedido existente — usado por un secretario desde
  // el detalle de la guía en el módulo de oficina.
  async vincularPedido(id: number, pedidoId: number) {
    const guia = await this.obtener(id);
    if (guia.anulado) throw new Error('La guía está anulada');
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    if (!pedido) throw new Error('Pedido no encontrado');
    if (pedido.estado === 'ANULADO') throw new Error('No se puede vincular un pedido anulado');
    return prisma.guia.update({ where: { id }, data: { pedidoId } });
  },

  // Guías nunca enviadas a SUNAT (estadoSunat null), no anuladas. Alimenta
  // tanto el contador de pendientes como el modal de selección del envío en lote.
  async pendientesSunat() {
    return prisma.guia.findMany({
      where: { anulado: false, estadoSunat: null },
      select: {
        id: true, numero: true, fechaEmision: true,
        cliente: { select: { razonSocial: true } },
      },
      orderBy: { fechaEmision: 'desc' },
    });
  },

  // Envío manual individual — usado por el botón "Enviar a SUNAT" del
  // detalle. GRE es asíncrono (ver _enviarASunat): el resultado final no
  // llega en esta llamada, solo el ticket — la confirmación final la trae
  // _procesarTicketsPendientes() más tarde.
  async reenviarSunat(id: number): Promise<void> {
    const guia = await prisma.guia.findUnique({ where: { id } });
    if (!guia) throw new Error('Guía no encontrada');
    if (guia.anulado) throw new Error('No se puede enviar a SUNAT una guía anulada');
    if (guia.estadoSunat === 'ACEPTADO') throw new Error('Esta guía ya fue enviada a SUNAT');
    if (guia.estadoSunat === 'ENVIADO_PENDIENTE') throw new Error('Esta guía ya fue enviada y está en proceso, espere la confirmación de SUNAT');
    await this._enviarASunat(id);
  },

  // Envío manual en lote — usado por el botón general "Enviar a SUNAT" del
  // listado, sobre las guías que el usuario elige en el modal de selección.
  // Recorre los ids secuencialmente para no saturar al servicio SUNAT,
  // y no aborta el lote si una guía falla.
  async enviarLoteSunat(ids: number[]): Promise<{ enviados: number; errores: Array<{ id: number; numero: string; error: string }> }> {
    const resultado = { enviados: 0, errores: [] as Array<{ id: number; numero: string; error: string }> };
    for (const id of ids) {
      const guia = await prisma.guia.findUnique({ where: { id } });
      if (!guia) {
        resultado.errores.push({ id, numero: '', error: 'Guía no encontrada' });
        continue;
      }
      try {
        if (guia.anulado) throw new Error('Guía anulada');
        if (guia.estadoSunat === 'ACEPTADO') throw new Error('Ya fue enviada a SUNAT');
        if (guia.estadoSunat === 'ENVIADO_PENDIENTE') throw new Error('Ya tiene un envío en proceso');
        await this._enviarASunat(id);
        resultado.enviados++;
      } catch (err) {
        resultado.errores.push({
          id, numero: guia.numero,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return resultado;
  },
};
