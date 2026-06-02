// FILE: src/modules/pedidos/pedidos.routes.ts
import { Router } from 'express';
import { pedidosController } from './pedidos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

router.get('/',                    pedidosController.listar.bind(pedidosController));
router.get('/:id',                 pedidosController.obtener.bind(pedidosController));
router.get('/:id/rentabilidad',    pedidosController.rentabilidad.bind(pedidosController));
router.post('/',                   pedidosController.crear.bind(pedidosController));
router.put('/:id',                 pedidosController.actualizar.bind(pedidosController));
router.patch('/:id/anular',        pedidosController.anular.bind(pedidosController));
router.delete('/:id',              pedidosController.eliminar.bind(pedidosController));

export default router;
