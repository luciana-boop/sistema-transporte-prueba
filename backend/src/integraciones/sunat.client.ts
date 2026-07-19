// FILE: src/integraciones/sunat.client.ts
// Cliente HTTP hacia cutyfact — servicio de facturación electrónica con
// credenciales almacenadas server-side. Autenticado con Bearer API key.
// Portado de MONKSAAS; en este sistema los archivos (XML/CDR) se guardan en
// disco local bajo storage/ en vez de Supabase Storage.

import fs from 'fs';
import path from 'path';

// Catálogo SUNAT 06 — Tipo de Documento de Identidad.
export const TIPO_DOC_IDENTIDAD_SUNAT: Record<string, string> = {
  DNI: '1',
  RUC: '6',
};

// El servicio devuelve el XML/CDR como base64 inline; se persisten en
// storage/sunat/ para servirlos después.
const BASE_DIR = path.join('storage', 'sunat');

export async function guardarBase64(base64: string | null | undefined, rutaRelativa: string): Promise<string | null> {
  if (!base64) return null;
  const buffer = Buffer.from(base64, 'base64');
  const rutaRel = path.join(BASE_DIR, ...rutaRelativa.split('/')).split(path.sep).join('/');
  const rutaAbs = path.join(process.cwd(), ...rutaRel.split('/'));
  fs.mkdirSync(path.dirname(rutaAbs), { recursive: true });
  fs.writeFileSync(rutaAbs, buffer);
  return rutaRel;
}

// GRE es asíncrono: el envío inicial (/guia) solo devuelve un ticket.
export interface SunatGuiaEnvioResultado {
  estadoSunat: string;
  numTicket: string;
  xml_base64?: string | null; // XML firmado del envío
}

// Mientras procesado=false hay que seguir consultando más tarde.
export interface SunatGuiaEstadoResultado {
  procesado: boolean;
  estadoSunat: string;
  respuesta_sunat_descripcion?: string | null;
  error?: string | null;
  cdr_base64?: string | null; // CDR ZIP en base64 cuando procesado=true
  // DocumentHash del CDR aceptado — el dato que la RS 123-2022 (Art. 34)
  // entrega "para generar el código QR" de la guía. Puede venir null (no
  // todos los CDR lo traen).
  documento_hash?: string | null;
}

function cutyfactUrl(): string {
  const url = process.env.CUTYFACT_API_URL;
  if (!url) throw new Error('CUTYFACT_API_URL no está configurada');
  return url.replace(/\/+$/, '');
}

function cutyfactKey(): string {
  const key = process.env.CUTYFACT_API_KEY;
  if (!key) throw new Error('CUTYFACT_API_KEY no está configurada');
  return key;
}

async function postCutyfact<T>(ruta: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${cutyfactUrl()}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cutyfactKey()}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`cutyfact respondió ${res.status} en ${ruta}: ${texto}`);
  }
  return res.json() as Promise<T>;
}

async function getCutyfact<T>(ruta: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${cutyfactUrl()}${ruta}?${qs}`, {
    headers: { Authorization: `Bearer ${cutyfactKey()}` },
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`cutyfact respondió ${res.status} en ${ruta}: ${texto}`);
  }
  return res.json() as Promise<T>;
}

export async function enviarGuiaSunat(payload: Record<string, unknown>): Promise<SunatGuiaEnvioResultado> {
  const p = payload as any;
  const raw = await postCutyfact<{ ok: boolean; numTicket?: string | null; error?: string | null; xml_base64?: string | null }>('/guia', {
    ruc_empresa: p.credenciales?.ruc ?? p.remitente?.ruc ?? p.ruc_empresa,
    destinatario: p.destinatario,
    envio: p.envio,
    items: p.items,
    // '09' Remitente (default) | '31' Transportista — ver guias.service.ts._enviarASunat.
    tipo_documento: p.tipo_documento,
    // Solo en tipo 31: remitente de la mercadería, tercero distinto de quien
    // emite (la transportista, dueña de ruc_empresa/credenciales).
    remitente_tercero: p.remitente_tercero,
  });
  return {
    estadoSunat: raw.ok ? 'ENVIADO_PENDIENTE' : 'ERROR',
    numTicket: raw.numTicket ?? '',
    xml_base64: raw.xml_base64,
  };
}

export async function consultarEstadoGuiaSunat(payload: Record<string, unknown>): Promise<SunatGuiaEstadoResultado> {
  const p = payload as any;
  const raw = await getCutyfact<{
    ok: boolean;
    procesado: boolean;
    respuesta_sunat_codigo?: string | null;
    respuesta_sunat_descripcion?: string | null;
    cdr_base64?: string | null;
    documento_hash?: string | null;
    error?: string | null;
  }>('/guia/estado', {
    ruc_empresa: p.credenciales?.ruc ?? '',
    ticket: p.numTicket ?? '',
  });
  return {
    procesado: raw.procesado,
    estadoSunat: raw.procesado
      ? (raw.respuesta_sunat_codigo === '0' ? 'ACEPTADO' : 'RECHAZADO')
      : 'ENVIADO_PENDIENTE',
    respuesta_sunat_descripcion: raw.respuesta_sunat_descripcion,
    error: raw.error,
    cdr_base64: raw.cdr_base64,
    documento_hash: raw.documento_hash,
  };
}
