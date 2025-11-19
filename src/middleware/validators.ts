import { query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

export const tokensQueryValidator = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('timePeriod').optional().isIn(['1h', '24h', '7d']).withMessage('timePeriod must be 1h|24h|7d'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('sortOrder must be asc|desc'),
  query('sortBy').optional().isString(),
];

export const searchQueryValidator = [
  query('q').exists().isString().withMessage('Query parameter "q" is required'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

export function handleValidationErrors(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      const msg = errors
        .array()
        .map((e: any) => `${e.param || e.path || 'param'}: ${e.msg || e.message}`)
        .join('; ');
    throw new ValidationError(msg);
  }
  next();
}

export default {
  tokensQueryValidator,
  searchQueryValidator,
  handleValidationErrors,
};
