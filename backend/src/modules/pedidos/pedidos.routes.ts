// FILE: src/modules/pedidos/pedidos.routes.ts
import { Router } from 'express';
import { pedidosController } from './pedidos.controller';
import { verificarToken, adminOSecretario } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, adminOSecretario);

// NUEVO: debe ir antes de /:id para que Express no lo interprete como un ID
router.get('/disponibles',         pedidosController.disponiblesParaFacturar.bind(pedidosController));

router.get('/',                    pedidosController.listar.bind(pedidosController));
router.get('/:id',                 pedidosController.obtener.bind(pedidosController));
router.get('/:id/rentabilidad',    pedidosController.rentabilidad.bind(pedidosController));
router.post('/',                   pedidosController.crear.bind(pedidosController));
router.put('/:id',                 pedidosController.actualizar.bind(pedidosController));
router.patch('/:id/anular',        pedidosController.anular.bind(pedidosController));
router.delete('/:id',              pedidosController.eliminar.bind(pedidosController));

export default router;
