// FILE: src/modules/contabilidad/contabilidad.routes.ts

import { Router, Request, Response } from 'express';
import {
  cuentasContablesController,
  asientosController,
  reportesContablesController,
  configContableController,
  mapeoContableController,
} from './contabilidad.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';
import { contabilidadIntegration } from './contabilidad.integration';
import { contabilidadDiagnostico } from './contabilidad.diagnostico';

const router = Router();
router.use(verificarToken, adminOSecretario);

// ── Plan de cuentas ───────────────────────────────────────────────────────────
router.get('/cuentas/arbol',   cuentasContablesController.arbol.bind(cuentasContablesController));
router.get('/cuentas',         cuentasContablesController.listar.bind(cuentasContablesController));
router.post('/cuentas',        cuentasContablesController.crear.bind(cuentasContablesController));
router.get('/cuentas/:id',     cuentasContablesController.obtener.bind(cuentasContablesController));
router.put('/cuentas/:id',     cuentasContablesController.actualizar.bind(cuentasContablesController));
router.delete('/cuentas/:id',  cuentasContablesController.eliminar.bind(cuentasContablesController));

// ── Asientos contables ────────────────────────────────────────────────────────
router.get('/asientos',        asientosController.listar.bind(asientosController));
router.post('/asientos',       asientosController.crear.bind(asientosController));
router.get('/asientos/:id',    asientosController.obtener.bind(asientosController));
router.delete('/asientos/:id', asientosController.eliminar.bind(asientosController));

// ── Reportes contables ────────────────────────────────────────────────────────
router.get('/reportes/libro-mayor/:cuentaId',   reportesContablesController.libroMayor.bind(reportesContablesController));
router.get('/reportes/balance-comprobacion',    reportesContablesController.balanceComprobacion.bind(reportesContablesController));
router.get('/reportes/estado-resultados',       reportesContablesController.estadoResultados.bind(reportesContablesController));
router.get('/reportes/balance-general',         reportesContablesController.balanceGeneral.bind(reportesContablesController));

// ── Configuración contable ─────────────────────────────────────────────────────
router.get('/configuracion',               configContableController.listar.bind(configContableController));
router.post('/configuracion',              configContableController.set.bind(configContableController));
router.delete('/configuracion/:clave',     configContableController.eliminar.bind(configContableController));

// ── Mapeo Categorías → Cuentas Contables ────────────────────────────────────────
router.get('/mapeos',  mapeoContableController.listar.bind(mapeoContableController));
router.post('/mapeos', mapeoContableController.set.bind(mapeoContableController));

// ── Diagnóstico ───────────────────────────────────────────────────────────────
router.get('/diagnostico', async (req: Request, res: Response) => {
  try {
    const result = await contabilidadDiagnostico.ejecutar();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Sincronización histórica ───────────────────────────────────────────────────
// Genera asientos automáticos para registros creados antes de instalar la integración
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await contabilidadIntegration.syncHistorico();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
