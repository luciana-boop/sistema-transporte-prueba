// FILE: src/utils/response.ts

import { Response } from 'express';

export const ok = (res: Response, data: unknown, message = 'OK') => {
  res.status(200).json({ success: true, message, data });
};

export const created = (res: Response, data: unknown, message = 'Creado correctamente') => {
  res.status(201).json({ success: true, message, data });
};

export const noContent = (res: Response) => {
  res.status(204).send();
};

export const badRequest = (res: Response, error: string) => {
  res.status(400).json({ success: false, error });
};

export const unauthorized = (res: Response, error = 'No autorizado') => {
  res.status(401).json({ success: false, error });
};

export const forbidden = (res: Response, error = 'Acceso denegado') => {
  res.status(403).json({ success: false, error });
};

export const notFound = (res: Response, error = 'Recurso no encontrado') => {
  res.status(404).json({ success: false, error });
};

export const serverError = (res: Response, error: unknown) => {
  console.error('[SERVER ERROR]', error);
  const message =
    process.env.NODE_ENV !== 'production' && error instanceof Error
      ? error.message
      : 'Error interno del servidor';
  res.status(500).json({ success: false, error: message });
};
