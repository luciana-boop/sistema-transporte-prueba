'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';

export interface SmartSearchOption {
  id: number | string;
  label: string;
  [key: string]: any;
}

interface SmartSearchInputProps {
  queryFn: (q: string) => Promise<SmartSearchOption[]>;
  value?: SmartSearchOption | null;
  onChange: (option: SmartSearchOption | null) => void;
  // Opcional: se invoca con cada cambio de texto (incluso sin seleccionar una
  // opción de la lista). Permite combos editables donde el valor libre
  // tecleado por el usuario también debe persistirse si no encuentra match
  // (p.ej. guía de referencia en Comprobantes). No afecta a los consumidores
  // que no lo usan.
  onTextChange?: (text: string) => void;
  placeholder?: string;
  className?: string;
}

export function SmartSearchInput({
  queryFn,
  value,
  onChange,
  onTextChange,
  placeholder = 'Buscar…',
  className,
}: SmartSearchInputProps) {
  const [q, setQ] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SmartSearchOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setQ(value?.label ?? '');
  }, [value?.id, value?.label]);

  const search = useCallback(
    (term: string) => {
      clearTimeout(timer.current);
      if (!term.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }
      timer.current = setTimeout(async () => {
        try {
          const r = await queryFn(term);
          setResults(r);
          setOpen(r.length > 0);
        } catch {
          // ignore
        }
      }, 280);
    },
    [queryFn],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQ(val);
    if (!val) onChange(null);
    onTextChange?.(val);
    search(val);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const select = (opt: SmartSearchOption) => {
    setQ(opt.label);
    setOpen(false);
    onChange(opt);
  };

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-7 pr-2 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full min-w-[200px] bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={() => select(opt)}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm truncate"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
