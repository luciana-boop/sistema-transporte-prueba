// FILE: src/modules/backup/backup.controller.ts

import { Request, Response } from 'express';
import { backupService } from './backup.service';
import * as R from '../../utils/response';

export class BackupController {
  async exportarJson(req: Request, res: Response): Promise<void> {
    try {
      const data = await backupService.exportarJson();
      const json = JSON.stringify(data, null, 2);
      const fecha = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=backup_transportes_${fecha}.json`);
      res.send(json);
    } catch (e) { R.serverError(res, e); }
  }

  async exportarExcel(req: Request, res: Response): Promise<void> {
    try {
      const { modulo } = req.params;
      const data = await backupService.exportarExcelData(modulo);
      res.json({ success: true, data, modulo });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no soportado')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }

  async restaurarJson(req: Request, res: Response): Promise<void> {
    try {
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        R.badRequest(res, 'Datos de backup inválidos'); return;
      }
      const result = await backupService.restaurarJson(backupData);
      R.ok(res, result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('inválido')) R.badRequest(res, msg);
      else R.serverError(res, e);
    }
  }
}

export const backupController = new BackupController();
