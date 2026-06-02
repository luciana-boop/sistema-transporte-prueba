// FILE: src/hooks/useConfig.ts
// Hook para consumir parámetros del sistema dinámicamente
'use client';

import { useQuery } from '@tanstack/react-query';
import { cuentasApi } from '@/services/api';
import { configuracionApi } from '@/services/api';
import { useMemo } from 'react';

export function useConfig() {
  const { data: monedaDefault } = useQuery({
    queryKey: ['moneda', 'default'],
    queryFn: () => cuentasApi.getMonedaDefault().then(r => r.data.data).catch(() => null),
    staleTime: 10 * 60 * 1000,
  });

  const { data: parametrosGrouped, isLoading } = useQuery({
    queryKey: ['config', 'parametros'],
    queryFn: () => configuracionApi.getParametros().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const flat = useMemo(() => {
    if (!parametrosGrouped) return {} as Record<string, string>;
    const result: Record<string, string> = {};
    for (const grupo of Object.values(parametrosGrouped)) {
      for (const p of grupo) {
        result[p.clave] = p.valor;
      }
    }
    return result;
  }, [parametrosGrouped]);

  const get = (clave: string, defaultVal = '') => flat[clave] ?? defaultVal;

  return {
    isLoading,
    // Empresa
    nombreEmpresa:    get('empresa_nombre', 'Mi Empresa SAC'),
    razonSocial:      get('empresa_razon_social', 'Mi Empresa SAC'),
    ruc:              get('empresa_ruc', '20000000001'),
    direccion:        get('empresa_direccion', ''),
    telefono:         get('empresa_telefono', ''),
    emailEmpresa:     get('empresa_email', ''),
    // Facturación
    igvPorcentaje:    parseFloat(get('igv_porcentaje', '18')),
    detraccionDefault:parseFloat(get('detraccion_porcentaje', '4')),
    monedaDefault:    get('moneda_default', 'PEN'),
    creditoDiasDefault:parseInt(get('credito_dias_default', '30')),
    // PDF
    pdfPiePagina:     get('pdf_pie_pagina', ''),
    pdfTextoLegal:    get('pdf_texto_legal', ''),
    pdfColorPrincipal:get('pdf_color_principal', '#2563eb'),
    pdfFormato:       get('pdf_formato_impresion', 'A4'),
    // Moneda dinámica
    monedaSimbolo:    monedaDefault?.simbolo ?? 'S/',
    monedaCodigo:     monedaDefault?.codigo ?? 'PEN',
    // Raw getter
    get,
  };
}
