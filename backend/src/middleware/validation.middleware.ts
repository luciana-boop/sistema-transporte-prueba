// FILE: src/middleware/validation.middleware.ts
// Validacion de entrada con express-validator para endpoints financieros.

import { Request, Response, NextFunction } from 'express';
import { ValidationChain, validationResult } from 'express-validator';
import * as R from '../utils/response';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    for (const validation of validations) {
      await validation.run(req);
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      R.badRequest(res, errors.array()[0].msg);
      return;
    }
    next();
  };
};
