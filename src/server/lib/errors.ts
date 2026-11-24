import type { ErrorRequestHandler, RequestHandler } from 'express';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static notFound(message = 'Không tìm thấy dữ liệu.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Không tìm thấy endpoint ${req.method} ${req.path}.`));
};

export function errorHandler(error: unknown, _req: Parameters<ErrorRequestHandler>[1], res: Parameters<ErrorRequestHandler>[2], _next: Parameters<ErrorRequestHandler>[3]): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const bodyErrorType =
    typeof error === 'object' && error !== null
      ? (error as { type?: string }).type
      : undefined;
  if (bodyErrorType === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body JSON không hợp lệ.' },
    });
    return;
  }
  if (bodyErrorType === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn.' },
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
  console.error('[server] Unhandled error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
}
