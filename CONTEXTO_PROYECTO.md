# CONTEXTO_PROYECTO.md

> **Propósito de este documento**: dar a cualquier nueva sesión de Claude Code el contexto completo del sistema en pocos minutos, sin tener que volver a inspeccionar cientos de archivos. Léelo primero, completo, antes de explorar el repositorio. Reduce consumo de tokens y evita reanálisis redundante.
>
> Generado a partir de lectura directa del código fuente real (schema de Prisma, servicios backend, páginas frontend, configuración) — no contiene información inventada. Si algo aquí entra en conflicto con lo que observas en el código actual, **confía en el código** y considera actualizar este archivo.

---

## 1. Resumen Ejecutivo

**Qué hace el sistema**: es un sistema de gestión integral (ERP a medida) para una **empresa de transporte de carga terrestre** en Perú. Cubre todo el ciclo operativo y financiero del negocio: desde que un cliente solicita un servicio de transporte, hasta que se factura, se cobra, se liquida al conductor sus gastos de viaje, y se controla el dinero de la empresa en cuentas y cajas.

**Tipo de empresa**: empresa de transporte/logística de carga (con flota propia de tractos y carretas, conductores asalariados/a comisión, clientes que contratan servicios de transporte por pedido).

**Flujo general de negocio** (visión de alto nivel — detalle completo en sección 5):
1. Un **Cliente** solicita un servicio → se registra como **Pedido** (origen, destino, tipo de carga, tarifa).
2. El servicio se **Factura** al cliente (con o sin Pedido de origen), generando un comprobante con PDF.
3. El cliente **paga** la factura → se registra en **Cobranza**, lo que mueve dinero hacia las **Cuentas** de la empresa.
4. En paralelo, el conductor que ejecutó el viaje rinde cuentas de sus gastos (peajes, viáticos, combustible, etc.) mediante una **Liquidación**, que se paga desde la **Caja**.
5. Todo el dinero de la empresa (ingresos y egresos) queda registrado y trazado en los módulos de **Cuentas** y **Caja** (dos sistemas que conviven — ver sección 6).

**Objetivo del software**: digitalizar y centralizar la operación (clientes, pedidos, flota, conductores, facturación, cobranza) y el control financiero (cuentas multi-moneda, caja diaria, gastos, combustible, liquidaciones de conductores), con trazabilidad completa (anulación lógica, nunca borrado físico de movimientos de dinero) y control de acceso granular por roles y permisos.

---

## 2. Stack Tecnológico

### Frontend (`frontend/`)
- **Next.js 14.2.3** (App Router, grupo de rutas `(dashboard)`)
- **React 18.3.1** + **TypeScript**
- **TailwindCSS** + **Radix UI** (`@radix-ui/react-*`: dialog, dropdown, select, tabs, toast, tooltip, etc.)
- **TanStack React Query v5** (`@tanstack/react-query`) — toda la obtención/mutación de datos del servidor
- **React Hook Form** + **Zod** (`@hookform/resolvers`) — formularios y validación
- **Zustand** — estado global (`auth.store.ts`, `permisos.store.ts`)
- **Recharts** — gráficos (dashboards, reportes)
- **lucide-react** — iconos
- **sonner** — notificaciones toast
- **axios** — cliente HTTP
- **date-fns** — manejo de fechas
- **xlsx** — exportación a Excel (reportes)

### Backend (`backend/`)
- **Express 4.18** + **TypeScript**
- **JWT** (`jsonwebtoken`) + **bcryptjs** — autenticación y hash de contraseñas
- **express-validator** — validación de requests
- **morgan** — logging HTTP
- **cors**, **dotenv**

### ORM
- **Prisma 5.9.1** (`@prisma/client` + `prisma` CLI). Schema único en `backend/prisma/schema.prisma`. 14 migraciones aplicadas (verificado con `npx prisma migrate status` → "Database schema is up to date").

### Base de datos
- **PostgreSQL** (datasource `provider = "postgresql"`, base llamada `transportes`, esquema `public`).

### Autenticación
- **JWT Bearer tokens** (`Authorization: Bearer <token>`), verificados en `backend/src/middleware/auth.middleware.ts`.
- Dos roles: `ADMIN` y `SECRETARIO` (enum `Rol`).
- **Permisos granulares** adicionales para `SECRETARIO`: por módulo (`PermisoModulo` / tabla `permisos_modulos`) y por acción especial (`PermisoAccion` / tabla `permisos_acciones`). `ADMIN` siempre tiene acceso total sin consultar la BD. Fuente de verdad: `config/permisos.config.ts` — **archivo duplicado idéntico en backend y frontend** (`backend/src/config/permisos.config.ts` y `frontend/src/config/permisos.config.ts`; verificado con `diff` → idénticos byte a byte; al modificar uno hay que replicar el cambio en el otro manualmente).

### PDF
- **pdfkit** (`backend/src/modules/facturacion/factura-pdf.generator.ts`) — genera el PDF de las facturas **localmente**, sin depender de servicios externos.

### SUNAT
- **No existe integración real con SUNAT.** El modelo `Factura` tiene campos preparados para una futura integración (`xmlPath`, `cdrPath`, `estadoSunat`, `hashXml`), y hay un comentario explícito en el controller de facturación (`// URL externa (SUNAT OSE, etc.)`), pero **no hay generación de XML, firma digital, ni comunicación con un OSE/PSE**. La facturación actual es 100% local (PDF con pdfkit + numeración correlativa propia por serie).

### Dependencias importantes a tener en cuenta
- `@tanstack/react-query` — todo fetch/mutación pasa por aquí (patrón `useQuery`/`useMutation`/`useQueryClient`)
- `zod` + `@hookform/resolvers` — esquemas de validación de formularios (`z.object({...})`, `zodResolver`)
- `zustand` — `useAuthStore`, `usePermisosStore`
- `recharts` — gráficos embebidos en casi todas las páginas de listado

---

## 3. Arquitectura General

Es un **monorepo con dos proyectos independientes** (no comparten `node_modules` ni build):

```
sistema-transporte-prueba/
├── backend/    → API REST en Express + Prisma + PostgreSQL
└── frontend/   → Next.js App Router (consume la API vía axios + React Query)
```

### Backend
- Arquitectura **modular por dominio**: `backend/src/modules/<modulo>/` con archivos `*.routes.ts` → `*.controller.ts` → `*.service.ts` (algunos módulos añaden `*.types.ts` o generadores como `factura-pdf.generator.ts`).
- Entry point: `backend/src/server.ts` → levanta `backend/src/app.ts`, que registra cada router bajo su prefijo (`app.use('/api/<modulo>', <modulo>Routes)`).
- Capa de autenticación separada en `backend/src/auth/` (no es un "módulo" más, es transversal).
- Middlewares transversales en `backend/src/middleware/` (`verificarToken`, `soloAdmin`, `adminOSecretario`).
- Cliente Prisma centralizado en `backend/src/prisma/client.ts`.
- Configuración compartida (permisos) en `backend/src/config/permisos.config.ts`.

### Prisma
- Un único schema: `backend/prisma/schema.prisma` (668 líneas, ~30 modelos/enums).
- Migraciones en `backend/prisma/migrations/` — 14 carpetas con timestamp; las últimas 3 (`20260607000000_add_liquidacion_to_combustible`, `20260607010000_gasto_vehiculo_instead_of_pedido`, `20260607020000_movimiento_cuenta_anulado`) corresponden a cambios recientes (asociación combustible↔liquidación, gasto↔vehículo, anulación de movimientos de cuenta).
- **Siempre verificar el estado real con `npx prisma migrate status`** antes de asumir que falta aplicar algo — los nombres de archivo no son garantía del estado real de la BD.

### Base de datos
- PostgreSQL con ~30 tablas (ver mapeo `@@map` en el schema). Nomenclatura: modelos en `PascalCase`/`camelCase`, tablas en `snake_case` plural.
- Convención de **anulación lógica** muy extendida: campos `anulado: Boolean` (nunca `DELETE` físico de registros financieros).

### Frontend
- Cada módulo = una carpeta bajo `frontend/src/app/(dashboard)/<modulo>/page.tsx` (Next.js App Router, grupo de rutas con layout compartido en `(dashboard)/layout.tsx`… realmente en `frontend/src/app/(dashboard)/layout.tsx`, no confirmado el path exacto pero la estructura es la estándar de App Router).
- **Un solo archivo central de integración HTTP**: `frontend/src/services/api.ts` — exporta un namespace `xxxApi` por módulo (`clientesApi`, `pedidosApi`, `facturacionApi`, `cobranzaApi`, `cajaApi`, `gastosApi`, `combustibleApi`, `liquidacionesApi`, `cuentasApi`, `usuariosApi`, `permisosApi`, `reportesApi`, etc.), todos tipados con `ApiResponse<T>`.
- **Tipos centralizados**: `frontend/src/types/index.ts` — todas las interfaces TS del dominio (deben mantenerse sincronizadas manualmente con los `include`/`select` de Prisma en los services del backend).
- **Componentes UI compartidos**: `frontend/src/components/shared/index.tsx` — `Button, Input, Select, Textarea, Modal, FormField, Table, Th, Td, Tr, Badge, EmptyState, TableSkeleton, StatCard, PageHeader, LoadingSpinner`, etc.
- **Estado global**: `frontend/src/store/auth.store.ts` (sesión/token/usuario) y `permisos.store.ts` (permisos del usuario actual).
- **Helpers**: `frontend/src/lib/utils.ts` — `formatCurrency`, `formatDate`, `getErrorMessage`, y los `*_LABEL` (mapas de enum → etiqueta en español: `ESTADO_FACTURA_LABEL`, `METODO_PAGO_LABEL`, `TIPO_GASTO_LABEL`, etc.)

### Relaciones entre módulos (resumen visual)
```
Clientes ──┬──> Pedidos ──> Facturación ──> Cobranza ──> Cuentas (CuentaDinero/MovimientoCuentaV2)
           │                                    │              │
           │                                    └──────────────┴──> (condicional) Caja/MovimientoCaja
           │
Conductores ──┬──> Liquidaciones <── Pedidos (N:M vía LiquidacionPedido)
              │         │
Vehículos ────┼─────────┼──> Combustible ──> Cuentas (MovimientoCuentaV2, EGRESO)
              │         │
              └─────────┴──> Gastos ──> Cuentas (MovimientoCuentaV2, EGRESO)

Liquidaciones ──> Caja/MovimientoCaja  (pago, reintegro, devolución — NO toca CuentaDinero)

Configuración ──> (provee datos base a) Facturación (series), Gastos (categorías),
                  Vehículos (tipos), Cuentas (monedas/tipos de pago/cuentas)

Usuarios ──> Permisos ──> (controla acceso a) todos los módulos
Reportes ──> (lee agregados de) Pedidos, Facturación, Cobranza, Caja, Gastos
```

---

## 4. Mapa Completo de Módulos

Para cada módulo: **qué hace** · **qué tablas usa** · **qué módulos impacta** · **qué módulos dependen de él**.

### Dashboard
- **Qué hace**: panel principal con métricas agregadas (pedidos del mes, estado de pedidos, financiero: facturado/cobrado/por cobrar/gastos/utilidad bruta).
- **Tablas**: lectura agregada de `pedidos`, `facturas`, `pagos`, `gastos`, `clientes` (vía `reportesService.dashboardGeneral`).
- **Impacta**: ninguno (solo lectura).
- **Depende de**: Pedidos, Facturación, Cobranza, Gastos, Clientes.

### Configuración
- **Qué hace**: parámetros generales del sistema, series de facturación, categorías de gasto, tablas maestras genéricas, configuración de alertas (vencimientos), tipos de vehículo, y — vía `cuentas.service.ts`/`cuentas.routes.ts` — gestión de monedas, tipos de pago y cuentas de dinero.
- **Tablas**: `configuraciones`, `series_facturacion`, `categorias_gasto`, `tablas_maestras`, `configuracion_alertas`, `tipos_vehiculo_config`, `monedas`, `tipos_pago`, `cuentas_dinero`.
- **Impacta**: Facturación (series correlativas), Gastos (categorías), Vehículos (tipos), todo el sistema financiero (monedas/tipos de pago/cuentas son la base de Cuentas).
- **Depende de**: ninguno — es la capa base de datos maestras.

### Clientes
- **Qué hace**: CRUD de clientes, estadísticas por cliente (pedidos, facturado, pagado, saldo pendiente).
- **Tablas**: `clientes`.
- **Impacta**: Pedidos, Facturación, Cobranza (relación 1:N hacia ellos).
- **Depende de**: ninguno.

### Vehículos
- **Qué hace**: CRUD de la flota (tractos/carretas), control de vencimientos (SOAT, revisión técnica, mantenimientos).
- **Tablas**: `vehiculos`.
- **Impacta**: Combustible y Gastos (relación directa vía `vehiculoId`); Liquidaciones referencia placas como texto libre (`placaTracto`/`placaCarreta`, sin FK).
- **Depende de**: Configuración (`tipos_vehiculo_config`).

### Conductores
- **Qué hace**: CRUD de conductores, control de licencias y vencimientos.
- **Tablas**: `conductores`.
- **Impacta**: Liquidaciones, Combustible (relación directa vía `conductorId`).
- **Depende de**: ninguno.

### Pedidos
- **Qué hace**: registro de servicios de transporte solicitados (origen, destino, tipo de carga, tarifa), estados `ACTIVO`/`FACTURADO`/`ANULADO`, cálculo de rentabilidad por pedido.
- **Tablas**: `pedidos`, `liquidacion_pedidos` (relación N:M con liquidaciones).
- **Impacta**: Facturación (es el origen opcional de una factura; al facturarse pasa a `FACTURADO`), Liquidaciones (se asocian pedidos a liquidaciones; un pedido solo puede estar en UNA liquidación activa — regla validada en el service).
- **Depende de**: Clientes, Usuarios.

### Facturación
- **Qué hace**: emisión de facturas (con o sin pedido de origen), generación de número correlativo por serie, cálculo de IGV/detracción/fecha de vencimiento según condición de crédito, generación de PDF local (pdfkit), anulación lógica.
- **Tablas**: `facturas`, `factura_detalles`, `series_facturacion` (lectura/incremento de correlativo).
- **Impacta**: Cobranza (la factura es la base de los pagos; mantiene `totalPagado`/`estado`), Pedidos (marca como `FACTURADO` al facturar, `marcarComoFacturado`/`restaurarAActivo`).
- **Depende de**: Clientes, Pedidos (opcional), Configuración (series de facturación).
- **Nota SUNAT**: campos `xmlPath`/`cdrPath`/`estadoSunat`/`hashXml` existen pero no hay lógica de envío/consulta — ver sección 2.

### Cobranza
- **Qué hace**: registro de cobros/pagos sobre facturas emitidas, vista de "cuentas por cobrar" (saldo pendiente por factura), anulación lógica de pagos, vista de detalle enriquecida con el movimiento financiero generado, filtros unificados entre ambas pestañas (Pagos / Cuentas por Cobrar).
- **Tablas**: `pagos` (crea/lee/anula), `facturas` (lee y actualiza `totalPagado`/`estado`), `movimientos_cuenta_v2` (genera INGRESO obligatorio), `movimientos_caja` (genera condicionalmente).
- **Impacta**: **Cuentas** (siempre genera `MovimientoCuentaV2` INGRESO, actualiza `saldoActual`), **Caja** (genera `MovimientoCaja` INGRESO solo si la cuenta destino es de tipo `CAJA`, vinculado vía `movimientoCuentaId`+`pagoId` — es el ÚNICO módulo que conecta ambos sistemas financieros).
- **Depende de**: Facturación, Clientes, Cuentas (selección de cuenta destino es obligatoria).

### Caja
- **Qué hace**: control de caja física por turnos/arqueos (apertura con `saldoApertura`, cierre con `saldoCierre`, estado `ABIERTA`/`CERRADA`), registro de movimientos manuales de ingreso/egreso, anulación lógica, vista global de movimientos de todas las cajas.
- **Tablas**: `cajas`, `movimientos_caja`.
- **Impacta**: no escribe en `cuentas_dinero`/`movimientos_cuenta_v2` — es un **sistema de ledger paralelo** (ver sección 6, MUY IMPORTANTE).
- **Depende de**: recibe movimientos generados por **Cobranza** (cuando la cuenta destino es tipo CAJA) y por **Liquidaciones** (pago, reintegro, devolución — siempre, sin condición).

### Cuentas (dentro de Configuración → `cuentas.service.ts` / `cuentas.routes.ts`)
- **Qué hace**: gestión de cuentas de dinero (`CuentaDinero`: CAJA/BANCO/DIGITAL, multi-moneda, saldo persistente), monedas, tipos de pago, y de los movimientos `MovimientoCuentaV2` (registrar/anular/editar/listar/ver detalle/filtrar). Es el **corazón del sistema financiero moderno** — expone el helper interno `_registrarMovimientoEnTx` que usan Gastos, Combustible y Cobranza para mover dinero de forma atómica.
- **Tablas**: `cuentas_dinero`, `monedas`, `tipos_pago`, `movimientos_cuenta_v2`.
- **Impacta**: es la base; Gastos, Combustible y Cobranza dependen de él para registrar cualquier movimiento de dinero.
- **Depende de**: ninguno — es la base financiera del sistema (junto con Caja, que es independiente).

### Gastos
- **Qué hace**: registro de gastos operativos (combustible, viáticos, peaje, mantenimiento, otros), asociados **opcionalmente a un Vehículo** (cambio reciente — antes se asociaban a un Pedido).
- **Tablas**: `gastos`, `movimientos_cuenta_v2` (genera EGRESO obligatorio, referencia `GASTO-{id}`).
- **Impacta**: Cuentas (siempre genera EGRESO, valida saldo suficiente).
- **Depende de**: Vehículos (asociación opcional), Cuentas (cuenta+moneda obligatorias para registrar).

### Combustible
- **Qué hace**: registro de cargas de combustible por vehículo (y opcionalmente conductor), asociación opcional a una **Liquidación** del conductor seleccionado, vista de detalle de solo lectura (recién agregada — PROBLEMA 9).
- **Tablas**: `combustible`, `movimientos_cuenta_v2` (genera EGRESO obligatorio, referencia `COMBUSTIBLE-{id}`).
- **Impacta**: Cuentas (siempre genera EGRESO), Liquidaciones (asociación opcional vía `liquidacionId`, valida que el conductor de la liquidación coincida).
- **Depende de**: Vehículos, Conductores (opcional), Liquidaciones (opcional), Cuentas (cuenta+moneda obligatorias).

### Liquidaciones
- **Qué hace**: liquidación de gastos de viaje del conductor (categorías: peaje/balanza/viático/toldo/otros vía `LiquidacionDetalle`), cálculo automático de **devolución** (sobra dinero → el conductor regresa) o **reintegro** (falta dinero → la empresa entrega más), pago total de la liquidación **desde una Caja abierta** (nunca cuentas bancarias, nunca pagos parciales), registro posterior de reintegros/devoluciones.
- **Tablas**: `liquidaciones`, `liquidacion_detalles`, `liquidacion_pedidos`, `movimientos_caja` (genera — **NO** `movimientos_cuenta_v2`, ver sección 6).
- **Impacta**: **Caja** (EGRESO al pagar `LIQUIDACION-{id}`, EGRESO en reintegro `REINTEGRO-LIQ-{id}`, INGRESO en devolución `DEVOLUCION-LIQ-{id}` — todo vía `MovimientoCaja`, requiere caja `ABIERTA`), Pedidos (relación N:M), Combustible (recibe asociaciones opcionales).
- **Depende de**: Conductores, Pedidos (opcional), Caja (debe existir una caja abierta para pagar).

### Reportes
- **Qué hace**: reportes agregados — pedidos, facturación, cobranza, caja, gastos, y un dashboard general consolidado. Exportación a Excel (xlsx) desde el frontend.
- **Tablas**: lectura agregada de `pedidos`, `facturas`, `pagos`, `movimientos_caja`, `gastos`.
- **Impacta**: ninguno (solo lectura).
- **Depende de**: Pedidos, Facturación, Cobranza, Caja, Gastos.

### Usuarios
- **Qué hace**: gestión de usuarios del sistema (solo `ADMIN`: crear, editar, activar/desactivar, cambiar contraseña, asignar rol).
- **Tablas**: `usuarios`.
- **Impacta**: Permisos (cada usuario tiene sus permisos asociados vía `PermisoModulo`/`PermisoAccion`); prácticamente todos los módulos referencian `usuarioId`.
- **Depende de**: Auth (capa de autenticación).

### Permisos
- **Qué hace**: asignación granular de acceso — habilitar/deshabilitar módulos completos y acciones especiales sensibles (anular factura, anular boleta, anular servicio, anular cobranza, anular comprobante) por usuario `SECRETARIO`. `ADMIN` siempre tiene acceso total sin pasar por estas tablas.
- **Tablas**: `permisos_modulos`, `permisos_acciones`.
- **Impacta**: controla qué ve/puede hacer cada usuario en el frontend (`usePermisos`/`usePermisosAdmin`/`permisos.store.ts`) y respalda los middlewares del backend.
- **Depende de**: Usuarios, y de la configuración estática `config/permisos.config.ts` (duplicada idéntica en frontend y backend — ver sección 2).

### Backups
- **Qué hace**: respaldo/restauración de la base de datos (módulo administrativo aislado).
- **Tablas**: ninguna propia — opera sobre la base de datos completa.
- **Impacta / depende de**: ninguno directamente — es independiente de la lógica de negocio del transporte.

---

## 5. Flujo Operativo Real

### Flujo A — Pedido → Facturación → Cobranza → Caja / Cuenta
*(cómo entra dinero a la empresa)*

1. **Pedido**: se crea un pedido (cliente, origen/destino, tipo de carga, tarifa) → estado `ACTIVO`.
2. **Facturación**: se emite una factura (opcionalmente desde un pedido específico — un pedido solo puede facturarse una vez mientras tenga una factura activa). Se genera `numeroFactura` correlativo por serie (`{serie}-{correlativo padded a 5}`), se calcula IGV/detracción/fecha de vencimiento, se genera el PDF local con `pdfkit`. La factura queda `EMITIDA`; si vino de un pedido, ese pedido pasa a `FACTURADO`.
3. **Cobranza**: el cliente paga (total o parcialmente). Al registrar el cobro, dentro de **una sola transacción**:
   - Se crea el registro `Pago`.
   - Se recalcula `factura.totalPagado` y `factura.estado` (`PARCIAL` o `PAGADA`).
   - **Siempre** se crea un `MovimientoCuentaV2` tipo `INGRESO` en la cuenta seleccionada (obligatoria) → actualiza `CuentaDinero.saldoActual` (referencia `PAGO-{id}`).
   - **Si y solo si** la cuenta elegida es de `tipoCuenta = 'CAJA'`, **además** se crea un `MovimientoCaja` `INGRESO` vinculado (`pagoId` + `movimientoCuentaId`) en la caja abierta del usuario actual — esto sincroniza ambos ledgers cuando corresponde.
4. **Resultado**: el dinero queda reflejado de forma persistente en `CuentaDinero.saldoActual` (fuente de verdad), y — solo si se cobró en una cuenta de tipo caja — también impacta el saldo (calculado en tiempo real) de la `Caja` del turno.

### Flujo B — Pedido → Liquidación → Combustible → Gastos → Pago liquidación
*(cómo sale dinero hacia conductores y operación)*

1. Uno o varios **Pedidos** se asocian a una **Liquidación** de un conductor (relación N:M vía `LiquidacionPedido`; regla de negocio: un pedido solo puede estar en UNA liquidación activa, validada en el service).
2. Se registran los gastos de viaje del conductor como `LiquidacionDetalle` (categorías: PEAJE, BALANZA, VIATICO, TOLDO, OTROS) → el sistema calcula `totalGastos = Σ detalles`.
3. Al crear la liquidación, se calcula automáticamente:
   - `diferencia = montoEntregado - totalGastos`
   - Si `diferencia > 0` → `devolucion = diferencia` (al conductor le sobró dinero, debe devolverlo).
   - Si `diferencia < 0` → `reintegro = |diferencia|` (el conductor gastó de más, la empresa debe reintegrarle).
4. *(Opcional)* Se registran cargas de **Combustible** asociadas a esa liquidación (`liquidacionId`) — generan `EGRESO` en `MovimientoCuentaV2` (sistema de **Cuentas**, no Caja; valida que el conductor de la liquidación coincida con el del registro de combustible).
5. *(Opcional)* Se registran **Gastos** asociados al **Vehículo** del conductor — también generan `EGRESO` en `MovimientoCuentaV2`.
6. **Pago de la liquidación**: SOLO puede pagarse desde una **Caja abierta** (nunca desde cuentas bancarias/CuentaDinero), por el monto **completo** `montoEntregado` (no se permiten pagos parciales) → genera `MovimientoCaja` `EGRESO` (`LIQUIDACION-{id}`), la liquidación pasa a estado `PAGADA`.
7. *(Solo sobre liquidaciones ya `PAGADA`s)*:
   - **Reintegro**: la empresa entrega dinero adicional al conductor → `MovimientoCaja` `EGRESO` (`REINTEGRO-LIQ-{id}`).
   - **Devolución**: el conductor regresa dinero sobrante → `MovimientoCaja` `INGRESO` (`DEVOLUCION-LIQ-{id}`).
   - Ambos requieren también una caja `ABIERTA` y validan que la liquidación tenga un monto de reintegro/devolución calculado `> 0`.

### Cómo fluye el dinero — resumen
| Operación | Dirección | Sistema que lo registra |
|---|---|---|
| Cobro de factura a cliente | ENTRA | `CuentaDinero`/`MovimientoCuentaV2` (siempre) **+** `Caja`/`MovimientoCaja` (solo si cuenta destino es tipo CAJA) |
| Gasto operativo | SALE | `CuentaDinero`/`MovimientoCuentaV2` (siempre) |
| Carga de combustible | SALE | `CuentaDinero`/`MovimientoCuentaV2` (siempre) |
| Pago de liquidación al conductor | SALE | `Caja`/`MovimientoCaja` únicamente (legado, no toca `CuentaDinero`) |
| Reintegro al conductor | SALE | `Caja`/`MovimientoCaja` únicamente |
| Devolución del conductor | ENTRA | `Caja`/`MovimientoCaja` únicamente |

---

## 6. Arquitectura Financiera Actual — MUY IMPORTANTE

### Dos sistemas de ledger financiero coexisten en paralelo

**1. `Caja` / `MovimientoCaja`** — sistema de turnos/arqueos diarios (más antiguo / "legado operativo"):
- `Caja`: representa una sesión física de caja abierta por un usuario (`saldoApertura`, `saldoCierre`, `estado: ABIERTA | CERRADA`, `aperturaEn`/`cierreEn`).
- `MovimientoCaja`: ingresos/egresos dentro de esa sesión, con anulación lógica (`anulado`), y vínculos opcionales a `pagoId`, `gastoId`, `movimientoCuentaId` (este último es el puente hacia el otro sistema).
- El **saldo de una Caja se calcula en tiempo real** (`saldoApertura + Σingresos activos − Σegresos activos`) — **no se persiste**.

**2. `CuentaDinero` / `MovimientoCuentaV2`** — sistema multi-moneda persistente (más nuevo, "CHAT 9" según comentarios del código):
- `CuentaDinero`: cuentas permanentes (`tipoCuenta: CAJA | BANCO | DIGITAL`), cada una con una `Moneda`, con saldo **persistido** `saldoActual`.
- `MovimientoCuentaV2`: `INGRESO | EGRESO | TRANSFERENCIA`, con anulación lógica (`anulado`, agregado en P7/PROBLEMA 7), vínculo opcional a `liquidacionId`, `tipoPagoId`, y `referencia` (convención de nombres por origen — ver abajo).
- El saldo se actualiza **atómicamente dentro de transacciones** vía el helper `cuentasService._registrarMovimientoEnTx(tx, dto)`, que valida saldo suficiente antes de cualquier egreso y aplica `increment`/`decrement` sobre `saldoActual`.

### ¿Cuál es la fuente de verdad?
**`CuentaDinero.saldoActual` / `MovimientoCuentaV2` es la fuente de verdad real del dinero de la empresa**: es persistente, multi-moneda, valida saldo antes de cada egreso, y centraliza la lógica en un único service (`cuentasService`). `Caja`/`MovimientoCaja` es un **sistema complementario/operativo para arqueos por turno**, cuyo saldo es calculado al vuelo y que **no siempre refleja todos los movimientos** de `CuentaDinero` (la sincronización solo ocurre desde Cobranza, y solo condicionalmente).

### Qué movimientos genera cada módulo

| Módulo | `MovimientoCuentaV2` | `MovimientoCaja` | Notas |
|---|---|---|---|
| **Cobranza** | SÍ — siempre `INGRESO` (`PAGO-{id}`) | Condicional — solo si la cuenta elegida es `tipoCuenta = CAJA`, vinculado vía `movimientoCuentaId` + `pagoId` | **Único módulo que conecta ambos sistemas** |
| **Gastos** | SÍ — siempre `EGRESO` (`GASTO-{id}`) | NO | cuenta + moneda obligatorias |
| **Combustible** | SÍ — siempre `EGRESO` (`COMBUSTIBLE-{id}`) | NO | cuenta + moneda obligatorias |
| **Liquidaciones** (pago/reintegro/devolución) | NO | SÍ — `LIQUIDACION-{id}` / `REINTEGRO-LIQ-{id}` / `DEVOLUCION-LIQ-{id}` | Solo desde Caja `ABIERTA`; nunca toca `CuentaDinero` |
| **Caja** (movimientos manuales) | NO | SÍ — manuales, sin `referencia` de origen | el módulo Caja nunca llama a `cuentasService` |
| **Anulación de movimiento de cuenta** (P7) | SÍ — crea reverso `REV-MOV-{id}` (tipo opuesto) | — | vía `_revertirMovimientoEnTx` |

### Reglas vigentes
- Toda creación de `MovimientoCuentaV2` ocurre **dentro de una transacción Prisma** (`prisma.$transaction`) junto con el registro operativo (Pago/Gasto/Combustible), reutilizando `cuentasService._registrarMovimientoEnTx(tx, dto)` — garantiza atomicidad total.
- Los **egresos validan saldo suficiente antes de escribir** (`saldoActual < monto` → error 4xx), tanto en frontend (UX) como en backend (re-leído dentro de la tx para evitar *race conditions*).
- **Anulación lógica, nunca `DELETE` físico** de registros financieros: se marca `anulado = true` y se crea un movimiento compensatorio de signo opuesto con `referencia: REV-MOV-{id}`. Aplica a `Pago`, `MovimientoCuentaV2` (agregado en P7) y `MovimientoCaja`.
- **Convención de `referencia` por origen** (clave para trazabilidad e inferencia de "origen" en vistas de detalle vía `_inferirOrigen()`): `GASTO-{id}`, `COMBUSTIBLE-{id}`, `PAGO-{id}`, `LIQUIDACION-{id}`, `REINTEGRO-LIQ-{id}`, `DEVOLUCION-LIQ-{id}`, `REV-MOV-{id}`.
- `cuentaId` y `monedaId` son **obligatorios** al registrar Gastos, Combustible y Cobros (decisión reciente — antes eran opcionales/inconsistentes).
- La funcionalidad de **"transferencia entre cuentas" fue retirada de la UI** (PROBLEMA 6), aunque el campo `cuentaDestinoId` y el valor `'TRANSFERENCIA'` del campo `tipo` (string libre, no enum) siguen existiendo en el modelo `MovimientoCuentaV2`.

### Problemas ya corregidos (ronda reciente de 9 PROBLEMAs)
1. Flujo de generación/visualización del PDF de facturación corregido.
2. Lógica financiera de Devolución/Reintegro de liquidaciones corregida.
3. Eliminada la sección "Liquidaciones Pendientes" de Caja (mezclaba conceptos de dos módulos y confundía a los usuarios).
4. Combustible ahora puede asociarse opcionalmente a la Liquidación del conductor (`liquidacionId`, con validación de que el conductor coincida).
5. En Gastos, el campo de asociación cambió de "Pedido asociado" a "Vehículo asociado" (más coherente con la realidad operativa — un gasto pertenece al vehículo, no a un pedido puntual).
6. Eliminada la opción "Transferencia entre cuentas" de la interfaz de Cuentas.
7. Movimientos de cuenta: se agregaron vista de detalle, edición controlada (no afecta montos/cuenta/tipo), anulación lógica con movimiento de reverso, y filtros — requirió migración `20260607020000_movimiento_cuenta_anulado` (ya aplicada).
8. Cobranza: se unificaron los filtros (búsqueda, rango de fechas, cliente, estado) y la vista de detalle entre las pestañas "Pagos" y "Cuentas por Cobrar", con un nuevo endpoint de detalle uniforme para cuentas por cobrar.
9. Combustible: se agregó una vista de detalle de solo lectura con datos enriquecidos (cuenta/moneda/usuario obtenidos del `MovimientoCuentaV2` vinculado, ya que `Combustible` no los almacena directamente).

---

## 7. Decisiones Técnicas Históricas

### Decisiones importantes ya tomadas

- **Cuenta y moneda obligatorias en Gastos, Combustible y Cobranza**
  *Por qué*: antes eran opcionales/inconsistentes, lo que permitía registrar movimientos de dinero "fantasma" que no impactaban ningún saldo real. Hacerlas obligatorias garantiza que **todo** movimiento de dinero quede reflejado en `CuentaDinero` (la fuente de verdad).

- **Las liquidaciones se pagan SOLO desde una Caja abierta, nunca desde cuentas bancarias**
  *Por qué*: refleja la operación real — el pago al conductor es en efectivo, desde la caja física del turno en curso (`pagarLiquidacion` valida explícitamente `caja.estado === 'ABIERTA'`).

- **No se permiten pagos parciales de liquidación** (el monto siempre es `montoEntregado` completo)
  *Por qué*: simplifica el flujo y evita estados intermedios ambiguos sobre cuánto se le adeuda al conductor.

- **Reintegro y Devolución solo se permiten sobre liquidaciones ya `PAGADA`s**
  *Por qué*: garantiza que el cálculo de la diferencia (`montoEntregado − totalGastos`) ya esté consolidado antes de mover dinero adicional; evita inconsistencias si se edita la liquidación a medio camino.

- **Eliminación de "Transferencia entre cuentas" de la interfaz**
  *Por qué*: aunque el campo `cuentaDestinoId`/tipo `TRANSFERENCIA` sigue en el schema, se decidió no exponer esta operación al usuario — previsiblemente para reducir errores de doble registro y simplificar el modelo mental de "ingreso/egreso".

- **Eliminación de "Liquidaciones Pendientes" de Caja**
  *Por qué*: esa vista mezclaba conceptos de dos módulos distintos (Caja y Liquidaciones) y confundía sobre dónde gestionar realmente las liquidaciones.

- **Anulación lógica en lugar de `DELETE` físico** (en `Pago`, `MovimientoCuentaV2`, `MovimientoCaja`, `Factura`)
  *Por qué*: preserva trazabilidad y auditoría completas. Toda reversión genera un movimiento compensatorio (`REV-MOV-{id}`) en lugar de borrar el original — el historial financiero nunca pierde información.

- **Gastos ahora se asocian a Vehículo en lugar de a Pedido**
  *Por qué*: un gasto (peaje, mantenimiento, combustible genérico) pertenece naturalmente al vehículo que lo generó, no a un pedido de transporte específico — modela mejor la realidad operativa.

- **Combustible puede asociarse opcionalmente a una Liquidación del conductor**
  *Por qué*: permite vincular cargas de combustible al viaje/liquidación correspondiente cuando aplica, sin forzar la asociación cuando no corresponde (carga genérica de flota).

- **PDF de facturas generado localmente con `pdfkit`, sin integración SUNAT real**
  *Por qué*: decisión pragmática para tener comprobantes funcionales sin depender de un proveedor OSE/PSE externo. El sistema deja "ganchos" preparados (`xmlPath`, `cdrPath`, `estadoSunat`, `hashXml`) para una eventual integración futura.

- **Sistema de permisos en dos niveles (módulos + acciones especiales)**
  *Por qué*: `ADMIN` necesita acceso total sin fricción; `SECRETARIO` necesita acceso configurable módulo por módulo, y ciertas acciones especialmente sensibles (anular factura/boleta/servicio/cobranza/comprobante) requieren un permiso explícito adicional, independiente del acceso al módulo. Fuente de verdad única en `config/permisos.config.ts`.

- **Edición de movimientos de cuenta controlada — no afecta montos** (`actualizarMovimiento` solo permite `concepto`/`referencia`/`fecha`/`tipoPagoId`)
  *Por qué*: evita que una edición rompa la integridad del saldo ya calculado y trazado. Cualquier corrección de monto/cuenta/tipo debe hacerse vía anulación + nuevo registro, preservando el historial.

---

## 8. Archivos Críticos

### Archivos que SIEMPRE conviene revisar antes de tocar algo relacionado

| Archivo | Por qué es importante |
|---|---|
| `backend/prisma/schema.prisma` | Única fuente de verdad del modelo de datos. Cualquier cambio de campos/relaciones requiere una migración — y antes de tocarlo hay que entender las relaciones cruzadas (p.ej. `MovimientoCuentaV2.liquidacionId`, `Combustible.liquidacionId`, `MovimientoCaja.movimientoCuentaId`). |
| `backend/src/modules/configuracion/cuentas.service.ts` | Corazón del sistema financiero moderno: `_registrarMovimientoEnTx`, `_revertirMovimientoEnTx`, validación de saldo, `_inferirOrigen`. **Cualquier módulo que mueva dinero pasa por aquí.** |
| `backend/src/modules/caja/caja.service.ts` | El otro ledger (paralelo/legado). Hay que entender ambos sistemas (sección 6) antes de modificar cualquier cosa financiera, para no romper la sincronización parcial que existe. |
| `backend/src/modules/liquidaciones/liquidaciones.service.ts` | Lógica de cálculo de devolución/reintegro y de todo el flujo de pago — usa `Caja`, NO `CuentaDinero` (fácil de confundir si no se lee primero). |
| `backend/src/modules/facturacion/*` | Generación de número de factura (correlativos por serie), cálculo de IGV/detracción, generación de PDF, y los campos "preparados" para SUNAT. |
| `backend/src/modules/cobranza/*` | Único módulo que conecta los dos sistemas financieros (genera `MovimientoCuentaV2` siempre + `MovimientoCaja` condicional). |
| `backend/src/app.ts` | Registro central de rutas — necesario para saber qué módulos existen y bajo qué prefijo de API. |
| `backend/src/config/permisos.config.ts` (y su gemelo en frontend) | Fuente de verdad de módulos y acciones del sistema de permisos — **duplicado manualmente**, hay que mantener ambos sincronizados. |
| `frontend/src/services/api.ts` | Punto único de integración HTTP — todos los `xxxApi` namespaces, tipos de request/response, y la convención de `ApiResponse<T>`. |
| `frontend/src/types/index.ts` | Todos los tipos TS del dominio — debe mantenerse sincronizado a mano con los `include`/`select` de Prisma en los services del backend (patrón usado en P8/P9: `XxxDetalle extends Xxx`). |
| `frontend/src/components/shared/index.tsx` | Componentes UI compartidos (`Modal, Table, Tr, Td, Th, FormField, Button, Select`, etc.). Conocer sus props exactas evita errores de tipo — p.ej. **`Tr` solo acepta `children`/`onClick`, NO `className`**. |
| `frontend/src/store/auth.store.ts` y `permisos.store.ts` | Estado global de sesión y permisos, consumido en cada página del dashboard. |

---

## 9. Archivos que normalmente NO necesitan revisarse

Para ahorrar tokens, estos pueden asumirse estables salvo que la tarea los mencione explícitamente:

- **CRUDs maestros simples sin lógica financiera**: `frontend/src/app/(dashboard)/clientes/page.tsx`, `conductores/page.tsx`, `vehiculos/page.tsx`, `usuarios/page.tsx` — siguen el mismo patrón estándar (Table + Modal + react-hook-form + zod) y rara vez requieren cambios estructurales.
- **`frontend/src/components/shared/index.tsx`** — componentes visuales estables, ya mapeados en la sección 8 (solo revisar si hay que agregar/cambiar uno).
- **`frontend/src/lib/utils.ts`** — helpers y mapas de etiquetas (`formatCurrency`, `formatDate`, `*_LABEL`) que cambian con muy poca frecuencia.
- **`backend/src/middleware/auth.middleware.ts`** — middleware de autenticación estable y ya validado (verificación de JWT, `soloAdmin`, `adminOSecretario`).
- **Migraciones antiguas** en `backend/prisma/migrations/` anteriores a junio 2026 — son historial; usar `npx prisma migrate status` para ver el estado real en lugar de leer cada carpeta.
- **`backend/src/modules/backup/*`** — módulo administrativo aislado, sin relación con la lógica de negocio del transporte.
- **Componentes de gráficos (Recharts)** embebidos en cada página de listado — solo presentación, sin lógica de negocio.
- **`frontend/tsconfig.tsbuildinfo`** — metadato de compilación de TypeScript; siempre aparece "modificado" tras correr `tsc`, descartar el diff con `git checkout -- frontend/tsconfig.tsbuildinfo`.

---

## 10. Estado Actual del Proyecto

### Funcionalidades terminadas
- CRUDs completos con validación: Clientes, Conductores, Vehículos, Pedidos, Usuarios.
- **Facturación**: emisión, PDF local, anulación, cálculo de IGV/detracción, series correlativas.
- **Cobranza**: registro de cobros, cuentas por cobrar, anulación lógica, filtros y vista de detalle unificados entre pestañas (recién completado).
- **Caja**: apertura/cierre de turnos, movimientos manuales, anulación lógica, vista global de movimientos.
- **Cuentas / financiero moderno**: cuentas multi-moneda, monedas, tipos de pago, movimientos con detalle/edición controlada/anulación lógica con reverso/filtros (recién completado).
- **Gastos**: registro asociado a Vehículo (migrado desde Pedido), genera movimiento financiero obligatorio con validación de saldo.
- **Combustible**: registro de cargas, asociación opcional a Liquidación, vista de detalle de solo lectura con datos enriquecidos (recién completado).
- **Liquidaciones**: cálculo automático de devolución/reintegro, pago desde caja abierta, registro de reintegros y devoluciones, historial financiero.
- **Reportes**: pedidos, facturación, cobranza, caja, gastos, dashboard general consolidado, exportación a Excel.
- **Permisos**: sistema granular por módulo y por acción especial, configuración desde panel de administración.
- **Backups**: respaldo/restauración de base de datos.

### Funcionalidades parcialmente terminadas
- **Integración SUNAT**: solo existen campos de schema preparados (`xmlPath`, `cdrPath`, `estadoSunat`, `hashXml`) y un comentario indicando dónde iría la "URL externa (SUNAT OSE, etc.)". No hay generación de XML, firma digital, ni comunicación con un OSE/PSE — la facturación es 100% local.
- **Unificación de los dos sistemas financieros (`Caja` vs `CuentaDinero`)**: coexisten de forma parcialmente sincronizada. Cobranza los conecta *condicionalmente* (solo si la cuenta destino es de tipo CAJA); Liquidaciones usa **exclusivamente** el sistema legado (`MovimientoCaja`), por lo que el pago de liquidaciones, reintegros y devoluciones **no impacta** el `saldoActual` de ninguna `CuentaDinero` — son dos vistas del dinero de la empresa que pueden no coincidir.
- **Campo `MovimientoCuentaV2.cuentaDestinoId` y valor `'TRANSFERENCIA'`**: existen en el modelo de datos pero la funcionalidad fue retirada de la interfaz (PROBLEMA 6) — son código/schema "muerto" parcial que sigue presente.

### Pendientes (inferidos del estado del código — no hay un backlog explícito documentado)
- Definir si se completará alguna vez la integración real con SUNAT/OSE o si se mantiene la facturación local indefinidamente.
- Decidir si se migra el flujo de pago de liquidaciones (pago/reintegro/devolución) hacia `CuentaDinero`/`MovimientoCuentaV2` para unificar la fuente de verdad financiera, o si se documenta oficialmente a `Caja` como el ledger correcto y exclusivo para movimientos de efectivo a conductores.
- Posible limpieza futura de `cuentaDestinoId`/`'TRANSFERENCIA'` si se confirma que la funcionalidad no volverá a exponerse.

---

## 11. Riesgos del Sistema

- **Módulos delicados**:
  - `cuentas.service.ts` — cualquier error en `_registrarMovimientoEnTx`/`_revertirMovimientoEnTx` corrompe saldos reales de cuentas de dinero.
  - `caja.service.ts` — el saldo se calcula en tiempo real sumando movimientos activos; un cambio en esa fórmula de agregación afecta todos los arqueos históricos mostrados.
  - `liquidaciones.service.ts` — cálculo de `devolucion`/`reintegro` y reglas de transición de estado (`PENDIENTE` → `PAGADA`).

- **Tablas delicadas**:
  - `cuentas_dinero.saldo_actual` — campo persistido que debe mantenerse perfectamente sincronizado con la suma de `movimientos_cuenta_v2` activos. **Nunca debe escribirse directamente** fuera de `_registrarMovimientoEnTx`/`_revertirMovimientoEnTx` (que usan `increment` atómico dentro de la transacción).
  - `movimientos_cuenta_v2` y `movimientos_caja` — registros de trazabilidad financiera; **nunca deben borrarse físicamente**, solo anularse lógicamente (`anulado = true` + reverso).
  - `facturas` — el par `totalPagado`/`estado` debe mantenerse consistente con la suma de `pagos` activos asociados; cualquier cambio manual fuera del flujo de Cobranza puede desincronizarlo.
  - `liquidaciones` — los campos `totalGastos`/`devolucion`/`reintegro` se calculan **una sola vez al crear** la liquidación; el método `update()` actual no permite modificar `detalles` ni recalcula estos totales — si se necesita esa funcionalidad en el futuro, hay que implementarla con cuidado.

- **Transacciones delicadas**: toda operación que combina un registro operativo (Pago/Gasto/Combustible/Liquidación) con un movimiento financiero **debe** ocurrir dentro de un único `prisma.$transaction()`. Separar estos pasos puede dejar el sistema en un estado inconsistente (registro creado sin movimiento financiero, o saldo modificado sin el registro operativo correspondiente).

- **Cosas que NO deben modificarse sin revisar el impacto completo primero**:
  - El campo `CuentaDinero.saldoActual` — solo a través de los helpers de `cuentasService` (nunca con un `update` directo de Prisma).
  - Las convenciones de `referencia` (`GASTO-{id}`, `PAGO-{id}`, `COMBUSTIBLE-{id}`, `LIQUIDACION-{id}`, `REINTEGRO-LIQ-{id}`, `DEVOLUCION-LIQ-{id}`, `REV-MOV-{id}`) — son la única forma de vincular un movimiento con su origen; cambiarlas rompe `_inferirOrigen()` y todas las consultas `findFirst({ where: { referencia: ... } })` que enriquecen las vistas de detalle (patrón usado en Cobranza P8 y Combustible P9).
  - Las relaciones `Combustible.liquidacionId` y `MovimientoCuentaV2.liquidacionId` — son recientes; cualquier cambio debe preservar la validación "el conductor de la liquidación debe coincidir con el del registro".
  - Las migraciones ya aplicadas — siempre correr `npx prisma migrate status` antes de generar una nueva, y nunca editar una migración ya aplicada a la base de datos.
  - El componente `Tr` de `components/shared` — solo acepta `children`/`onClick`; agregarle `className` rompe la compilación TypeScript (error ya visto y documentado).

---

## 12. Guía para Futuras Sesiones de Claude

### "Si eres una nueva sesión de Claude Code"

1. **Lee primero este archivo completo** (`CONTEXTO_PROYECTO.md`) antes de explorar el repositorio — te ahorra horas de re-análisis.
2. Si la tarea menciona un módulo específico, **revisa solo los archivos críticos de la sección 8** relacionados con ese módulo (y, si aplica, su contraparte en la sección 6 si mueve dinero) — no reanalices todo el proyecto desde cero.
3. **No vuelvas a leer `schema.prisma` completo** si solo necesitas un modelo puntual — usa `grep`/búsqueda dirigida sobre el modelo relevante (el archivo tiene ~30 modelos).
4. Antes de cualquier cambio de schema, corre `npx prisma migrate status` para verificar el estado real (no asumas nada por el nombre de la carpeta de migración — pueden estar ya aplicadas).
5. **Antes de modificar CUALQUIER cosa relacionada con dinero** (Cuentas, Caja, Cobranza, Gastos, Combustible, Liquidaciones), lee completa la **sección 6 (Arquitectura Financiera)** — el sistema tiene **dos ledgers paralelos** (`Caja` y `CuentaDinero`) y es muy fácil confundirlos o romper su sincronización parcial.
6. **Antes de tocar Facturación o cualquier cosa relacionada con "SUNAT"**, ten claro que **no existe integración real** — son solo campos de schema preparados (`xmlPath`, `cdrPath`, `estadoSunat`, `hashXml`); no asumas que hay lógica de envío/validación de comprobantes electrónicos que puedas reutilizar o que debas "arreglar".
7. Sigue el **patrón de enriquecimiento ya validado** para vistas de detalle: cuando un modelo no almacena `cuentaId`/`monedaId`/`usuarioId` directamente (p.ej. `Pago`, `Combustible`), búscalos vía `prisma.movimientoCuentaV2.findFirst({ where: { referencia: '<PREFIJO>-{id}' }, include: { cuenta, moneda, usuario } })` dentro del `findById` del service — exactamente como se hizo en Cobranza (P8) y Combustible (P9).
8. **Respeta las convenciones existentes**: anulación lógica (nunca `DELETE` físico de registros financieros), transacciones atómicas (`prisma.$transaction`), validación de saldo suficiente antes de cualquier egreso, convención de `referencia` por prefijo de origen.
9. Verifica los límites exactos de los **componentes UI compartidos** antes de usarlos de formas nuevas (p.ej. `Tr` no acepta `className`; `FormField` es un simple wrapper `flex flex-col gap-1.5` con `label`/`error`/`required`/`children`).
10. Después de cualquier cambio, verifica con `npx tsc --noEmit` (en `backend/` y en `frontend/`), compara contra los errores preexistentes (no asumas que un error es tuyo sin verificar si ya existía), y descarta el diff de `frontend/tsconfig.tsbuildinfo` con `git checkout -- frontend/tsconfig.tsbuildinfo`.
11. **Nunca leas el archivo `.env`** — usa el cliente Prisma ya configurado (`backend/src/prisma/client.ts`) y consultas de solo lectura para cualquier diagnóstico de base de datos; asume que la conexión ya funciona.
12. Si modificas `config/permisos.config.ts`, **recuerda replicar el cambio en ambas copias** (`backend/src/config/` y `frontend/src/config/` — actualmente idénticas byte a byte).

---

## Secciones más importantes para futuras sesiones (autoevaluación)

Si el tiempo/contexto es limitado, estas son las secciones que más valor aportan, en orden de prioridad:

1. **Sección 6 (Arquitectura Financiera Actual)** — es la pieza más compleja y más fácil de romper del sistema. Cualquier tarea que toque dinero debe pasar por aquí primero.
2. **Sección 8 (Archivos Críticos)** — mapa directo de "qué leer" para cada tipo de tarea, evita exploración a ciegas.
3. **Sección 4 (Mapa de Módulos)** — da el contexto de dependencias entre módulos necesario para anticipar efectos colaterales de un cambio.
4. **Sección 12 (Guía para futuras sesiones)** — checklist operativo concreto para no repetir errores ya conocidos (migraciones, `.env`, componentes UI, convención de referencias).
5. **Sección 7 (Decisiones Técnicas Históricas)** — evita proponer "mejoras" que en realidad ya fueron consideradas y descartadas conscientemente (p.ej. transferencias entre cuentas, pagos parciales de liquidación).
