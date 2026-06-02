// FILE: src/modules/caja/caja.routes.ts

import { Router } from 'express';
import { cajaController } from './caja.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();

router.use(verificarToken, adminOSecretario);

router.get('/', cajaController.listar.bind(cajaController));
router.get('/actual', cajaController.cajaActual.bind(cajaController));
router.get('/:id', cajaController.obtener.bind(cajaController));
router.post('/abrir', cajaController.abrir.bind(cajaController));
router.patch('/:id/cerrar', cajaController.cerrar.bind(cajaController));
router.post('/:id/movimiento', cajaController.registrarMovimiento.bind(cajaController));
router.delete('/:id', cajaController.eliminar.bind(cajaController));

export default router;
