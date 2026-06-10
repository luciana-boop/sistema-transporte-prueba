// FILE: src/modules/backup/backup.routes.ts

import { Router } from 'express';
import { backupController } from './backup.controller';
import { verificarToken, soloAdmin } from '../../middleware/auth.middleware';
import { verificarModulo } from '../../middleware/permisos.middleware';
import { logActividad } from '../../middleware/logger.middleware';

const router = Router();
router.use(verificarToken, soloAdmin, verificarModulo('backups'));

router.get('/json', logActividad('BACKUP', 'EXPORT_JSON'), backupController.exportarJson.bind(backupController));
router.get('/excel/:modulo', logActividad('BACKUP', 'EXPORT_EXCEL'), backupController.exportarExcel.bind(backupController));
router.post('/restaurar', logActividad('BACKUP', 'RESTORE_JSON'), backupController.restaurarJson.bind(backupController));

export default router;
