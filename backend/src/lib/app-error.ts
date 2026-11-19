// Error controlado de la API. `code` es siempre uno del enum ErrorCode de docs/openapi.yaml.
export type ErrorCode =
  | 'MALFORMED_REQUEST'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'SESSION_INVALID'
  | 'STOCK_CHANGED'
  | 'INVALID_ORDER_TRANSITION'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
