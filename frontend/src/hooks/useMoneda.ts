// FILE: src/hooks/useMoneda.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { cuentasApi } from '@/services/api';
import { useMemo } from 'react';
import type { Moneda } from '@/types';

export function useMoneda() {
  const { data: monedas = [] } = useQuery({
    queryKey: ['monedas', 'activas'],
    queryFn: () => cuentasApi.getMonedasActivas().then(r => r.data.data).catch(() => []),
    staleTime: 10 * 60 * 1000,
  });

  const { data: monedaDefault } = useQuery({
    queryKey: ['moneda', 'default'],
    queryFn: () => cuentasApi.getMonedaDefault().then(r => r.data.data).catch(() => null),
    staleTime: 10 * 60 * 1000,
  });

  const simboloMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const m of monedas) map[m.id] = m.simbolo;
    return map;
  }, [monedas]);

  const codigoMap = useMemo(() => {
    const map: Record<string, Moneda> = {};
    for (const m of monedas) map[m.codigo] = m;
    return map;
  }, [monedas]);

  const formatWithSimbolo = (amount: number, monedaId?: number, monedaCodigo?: string) => {
    let simbolo = 'S/';
    if (monedaId && simboloMap[monedaId]) {
      simbolo = simboloMap[monedaId];
    } else if (monedaCodigo && codigoMap[monedaCodigo]) {
      simbolo = codigoMap[monedaCodigo].simbolo;
    } else if (monedaDefault) {
      simbolo = monedaDefault.simbolo;
    }
    return `${simbolo} ${amount.toFixed(2)}`;
  };

  const getSimbolo = (monedaId?: number, codigo?: string) => {
    if (monedaId && simboloMap[monedaId]) return simboloMap[monedaId];
    if (codigo && codigoMap[codigo]) return codigoMap[codigo].simbolo;
    return monedaDefault?.simbolo ?? 'S/';
  };

  return {
    monedas,
    monedaDefault,
    simboloMap,
    codigoMap,
    formatWithSimbolo,
    getSimbolo,
    defaultId: monedaDefault?.id,
    defaultCodigo: monedaDefault?.codigo ?? 'PEN',
    defaultSimbolo: monedaDefault?.simbolo ?? 'S/',
  };
}
