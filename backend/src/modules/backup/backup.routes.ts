// FILE: src/modules/backup/backup.routes.ts

import { Router } from 'express';
import { backupController } from './backup.controller';
import { verificarToken, soloAdmin } from '../../middleware/auth.middleware';

const router = Router();
router.use(verificarToken, soloAdmin);

router.get('/json', backupController.exportarJson.bind(backupController));
router.get('/excel/:modulo', backupController.exportarExcel.bind(backupController));
router.post('/restaurar', backupController.restaurarJson.bind(backupController));

export default router;
