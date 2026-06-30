// FILE: src/modules/configuracion/configuracion.routes.ts
// CAMBIOS:
//   - Agrega GET /facturacion/unidades-medida  → sin autenticación de admin
//     (accesible desde el módulo Facturación para poblar los selects)
//   - Agrega GET /facturacion/codigos-factura   → ídem
//   - El resto de rutas NO se modifica

import { Router } from 'express';
import { configuracionController } from './configuracion.controller';
import { verificarToken } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';

const router = Router();

// ── Rutas públicas para módulos internos (solo token, no admin) ───────────────
// Facturación necesita consultar unidades y códigos sin requerir rol ADMIN.
// Se exige permiso de acceso al módulo facturación, ya que estos datos
// solo tienen sentido dentro de ese flujo.
router.get(
  '/facturacion/unidades-medida',
  verificarToken,
  verificarModulo('facturacion'),
  configuracionController.getUnidadesMedida.bind(configuracionController),
);
router.get(
  '/facturacion/codigos-factura',
  verificarToken,
  verificarModulo('facturacion'),
  configuracionController.getCodigosFactura.bind(configuracionController),
);

// ── Resto de rutas: requiere permiso de módulo (ADMIN siempre pasa) ────────────
router.use(verificarToken, verificarModulo('configuracion'));

// Inicializar defaults
router.post('/inicializar', configuracionController.inicializar.bind(configuracionController));

// Parámetros generales
router.get('/parametros',                   configuracionController.getParametros.bind(configuracionController));
router.get('/parametros/:clave',            configuracionController.getParametro.bind(configuracionController));
router.put('/parametros/:clave',            configuracionController.updateParametro.bind(configuracionController));
router.put('/parametros',                   configuracionController.updateParametrosBulk.bind(configuracionController));

// Series de facturación
router.get('/series',                       configuracionController.getSeries.bind(configuracionController));
router.get('/series/activas',               configuracionController.getSeriesActivas.bind(configuracionController));
router.post('/series',                      configuracionController.createSerie.bind(configuracionController));
router.put('/series/:id',                   configuracionController.updateSerie.bind(configuracionController));
router.delete('/series/:id',               configuracionController.deleteSerie.bind(configuracionController));

// Categorías de gasto
router.get('/categorias-gasto',             configuracionController.getCategoriasGasto.bind(configuracionController));
router.post('/categorias-gasto',            configuracionController.createCategoriaGasto.bind(configuracionController));
router.put('/categorias-gasto/:id',         configuracionController.updateCategoriaGasto.bind(configuracionController));
router.delete('/categorias-gasto/:id',      configuracionController.deleteCategoriaGasto.bind(configuracionController));

// Alertas
router.get('/alertas',                      configuracionController.getAlertas.bind(configuracionController));
router.put('/alertas/bulk',                 configuracionController.updateAlertasBulk.bind(configuracionController));
router.put('/alertas/:id',                  configuracionController.updateAlerta.bind(configuracionController));

// Tablas maestras (incluye unidad_medida y codigo_factura via ?tipo=)
router.get('/tablas',                       configuracionController.getTodosTipos.bind(configuracionController));
router.get('/tablas/:tipo',                 configuracionController.getTablaMaestra.bind(configuracionController));
router.post('/tablas',                      configuracionController.createTablaMaestra.bind(configuracionController));
router.put('/tablas/:id',                   configuracionController.updateTablaMaestra.bind(configuracionController));
router.delete('/tablas/:id',               configuracionController.deleteTablaMaestra.bind(configuracionController));

// Tipos vehículo
router.get('/tipos-vehiculo',               configuracionController.getTiposVehiculo.bind(configuracionController));
router.post('/tipos-vehiculo',              configuracionController.createTipoVehiculo.bind(configuracionController));
router.put('/tipos-vehiculo/:id',           configuracionController.updateTipoVehiculo.bind(configuracionController));
router.delete('/tipos-vehiculo/:id',        configuracionController.deleteTipoVehiculo.bind(configuracionController));

export default router;
