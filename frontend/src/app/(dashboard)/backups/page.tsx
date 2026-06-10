// FILE: src/app/(dashboard)/backups/page.tsx
'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Upload, AlertTriangle, CheckCircle, Database, FileSpreadsheet, FileJson } from 'lucide-react';
import { backupsApi, clientesApi, pedidosApi, conductoresApi, vehiculosApi, gastosApi, liquidacionesApi, combustibleApi, usuariosApi, fetchAllPages } from '@/services/api';
import { facturacionApi } from '@/services/api';
import { PageHeader, Button, StatCard } from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_PEDIDO_LABEL, ESTADO_FACTURA_LABEL, TIPO_GASTO_LABEL } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import * as XLSX from 'xlsx';

export default function BackupsPage() {
  const { usuario } = useAuthStore();
  const [loadingJson, setLoadingJson] = useState(false);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  // Prefetch counts for display
  const { data: clientesTotal = 0 } = useQuery({ queryKey: ['clientes', 'count'], queryFn: () => clientesApi.listar({ limit: 1 }).then(r => r.data.data.total) });
  const { data: pedidosTotal = 0 } = useQuery({ queryKey: ['pedidos', 'count'], queryFn: () => pedidosApi.listar({ limit: 1 }).then(r => r.data.data.total) });
  const { data: conductoresTotal = 0 } = useQuery({ queryKey: ['conductores', 'count'], queryFn: () => conductoresApi.listar({ limit: 1 }).then(r => r.data.data.total) });
  const { data: vehiculosTotal = 0 } = useQuery({ queryKey: ['vehiculos', 'count'], queryFn: () => vehiculosApi.listar({ limit: 1 }).then(r => r.data.data.total) });

  const handleJsonBackup = async () => {
    setLoadingJson(true);
    try {
      const res = await backupsApi.exportarJson();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_transportes_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup JSON descargado correctamente');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingJson(false);
    }
  };

  const handleExcelCompleto = async () => {
    setLoadingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      // Fetch all data in parallel
      const [
        cData, pData, facData, , condData, vehData,
        gData, liqData, combData
      ] = await Promise.all([
        fetchAllPages((p) => clientesApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => pedidosApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => facturacionApi.listar(p).then(r => r.data.data)),
        Promise.resolve([]),
        fetchAllPages((p) => conductoresApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => vehiculosApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => gastosApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => liquidacionesApi.listar(p).then(r => r.data.data)),
        fetchAllPages((p) => combustibleApi.listar(p).then(r => r.data.data)),
      ]);

      // Sheet: Clientes
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (cData as any[]).map(c => ({ '#': c.id, 'Razón social': c.razonSocial, RUC: c.ruc, Dirección: c.direccion, Teléfono: c.telefono ?? '', Email: c.email ?? '', Estado: c.activo ? 'Activo' : 'Inactivo' }))
      ), 'Clientes');

      // Sheet: Pedidos
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (pData as any[]).map(p => ({ '#': p.id, Cliente: p.cliente?.razonSocial, Origen: p.origen, Destino: p.destino, 'Tipo carga': p.tipoCarga, 'Tarifa S/': Number(p.tarifa), Estado: ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado, Fecha: formatDate(p.fechaPedido) }))
      ), 'Pedidos');

      // Sheet: Facturación
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (facData as any[]).map(f => ({ 'N° Factura': f.numeroFactura, Serie: f.serie, Cliente: f.cliente?.razonSocial, RUC: f.cliente?.ruc, 'Subtotal S/': Number(f.subtotal), 'IGV S/': Number(f.igv), 'Total S/': Number(f.total), 'Pagado S/': Number(f.totalPagado), Estado: ESTADO_FACTURA_LABEL[f.estado] ?? f.estado, Emisión: formatDate(f.fechaEmision), Vencimiento: formatDate(f.fechaVencimiento) }))
      ), 'Facturación');

      // Sheet: Conductores
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (condData as any[]).map(c => ({ '#': c.id, Nombre: c.nombre, DNI: c.dni, Licencia: c.licencia, 'Venc. Licencia': c.vencimientoLicencia ? formatDate(c.vencimientoLicencia) : '', Teléfono: c.telefono ?? '', 'Tracto pref.': c.tractoPreferencia ?? '', 'Carreta pref.': c.carretaPreferencia ?? '' }))
      ), 'Conductores');

      // Sheet: Vehículos
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (vehData as any[]).map(v => ({ Placa: v.placa, Tipo: v.tipo, Marca: v.marca, Modelo: v.modelo, Año: v.anio, 'Venc. SOAT': v.vencimientoSoat ? formatDate(v.vencimientoSoat) : '', 'Venc. Rev. Téc.': v.vencimientoRevision ? formatDate(v.vencimientoRevision) : '', Estado: v.estado }))
      ), 'Vehículos');

      // Sheet: Gastos
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (gData as any[]).map(g => ({ '#': g.id, Tipo: TIPO_GASTO_LABEL[g.tipoGasto] ?? g.tipoGasto, Descripción: g.descripcion, 'Monto S/': Number(g.monto), 'Pedido #': g.pedido ? g.pedido.id : '', Fecha: formatDate(g.fecha) }))
      ), 'Gastos');

      // Sheet: Liquidaciones
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (liqData as any[]).map(l => ({ '#': l.id, Conductor: l.conductor?.nombre, Fecha: formatDate(l.fecha), 'Placa tracto': l.placaTracto, 'Entregado S/': Number(l.montoEntregado), 'Gastos S/': Number(l.totalGastos), 'Devolución S/': Number(l.devolucion), 'Reintegro S/': Number(l.reintegro) }))
      ), 'Liquidaciones');

      // Sheet: Combustible
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (combData as any[]).map(r => ({ Placa: r.vehiculo?.placa, Conductor: r.conductor?.nombre ?? '', Fecha: formatDate(r.fecha), 'Galones/L': Number(r.galones), 'Monto S/': Number(r.monto), Grifo: r.grifo ?? '', 'Km': r.kilometraje ?? '' }))
      ), 'Combustible');

      XLSX.writeFile(wb, `backup_completo_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel completo descargado — ' + wb.SheetNames.length + ' hojas');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingExcel(false);
    }
  };

  const handleRestoreJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('⚠️ ¿Estás seguro? Restaurar un backup puede sobreescribir datos existentes. Esta acción no se puede deshacer.')) {
      e.target.value = '';
      return;
    }

    setLoadingRestore(true);
    setRestoreResult(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('El archivo no es un JSON válido');
        }
        if (!parsed.version || !parsed.data) {
          throw new Error('El formato del backup no es válido. Debe contener "version" y "data"');
        }
        const res = await backupsApi.restaurarJson(parsed);
        setRestoreResult({ success: true, message: res.data.data?.message ?? 'Backup restaurado correctamente' });
        toast.success('Backup restaurado');
      } catch (err) {
        const msg = getErrorMessage(err);
        setRestoreResult({ success: false, message: msg });
        toast.error(msg);
      } finally {
        setLoadingRestore(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="page-container">
      <PageHeader title="Backups" description="Exportar e importar datos del sistema" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Clientes" value={clientesTotal} color="blue" icon={Database} />
        <StatCard label="Pedidos" value={pedidosTotal} color="default" icon={Database} />
        <StatCard label="Conductores" value={conductoresTotal} color="green" icon={Database} />
        <StatCard label="Vehículos" value={vehiculosTotal} color="yellow" icon={Database} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* JSON Backup */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
              <FileJson className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Backup JSON</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exporta todos los datos del sistema en formato JSON. Ideal para respaldo completo.
              </p>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pl-1">
            {[
              'Usuarios', 'Clientes', 'Pedidos', 'Facturas y detalles', 'Pagos',
              'Cajas y movimientos', 'Gastos', 'Conductores', 'Vehículos',
              'Liquidaciones y pedidos asociados', 'Combustible',
              'Cuentas, monedas y movimientos', 'Configuración del sistema',
              'Permisos de usuarios', 'Registro de actividad',
            ].map(m => (
              <li key={m} className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-500" />{m}</li>
            ))}
          </ul>
          <Button onClick={handleJsonBackup} loading={loadingJson} className="mt-auto">
            <Download className="w-4 h-4" /> Descargar JSON
          </Button>
        </div>

        {/* Excel Backup */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Excel completo</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exporta todos los módulos en un archivo Excel con múltiples hojas.
              </p>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pl-1">
            {['Clientes', 'Pedidos', 'Facturación', 'Conductores', 'Vehículos', 'Gastos', 'Liquidaciones', 'Combustible'].map(m => (
              <li key={m} className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-500" />{m}</li>
            ))}
          </ul>
          <Button onClick={handleExcelCompleto} loading={loadingExcel} variant="secondary" className="mt-auto">
            <Download className="w-4 h-4" /> Descargar Excel
          </Button>
        </div>

        {/* Restore JSON */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Restaurar backup</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sube un archivo JSON de backup para restaurar los datos del sistema.
              </p>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Esta operación puede sobreescribir datos existentes. Se pedirá confirmación antes de proceder.
            </p>
          </div>

          {restoreResult && (
            <div className={`rounded-lg p-3 flex items-start gap-2 ${restoreResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
              {restoreResult.success
                ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
              <p className={`text-xs ${restoreResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {restoreResult.message}
              </p>
            </div>
          )}

          <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestoreJson} />
          <Button
            variant="secondary"
            loading={loadingRestore}
            onClick={() => restoreRef.current?.click()}
            className="mt-auto"
          >
            <Upload className="w-4 h-4" /> Subir backup JSON
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border">
        <p className="text-xs font-medium mb-2">Recomendaciones de backup</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Realiza backups JSON al menos una vez por semana</div>
          <div className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Guarda los backups en una ubicación externa segura</div>
          <div className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Verifica el backup restaurando en un entorno de prueba</div>
        </div>
      </div>
    </div>
  );
}
