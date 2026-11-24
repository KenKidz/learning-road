import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRoom = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(handler: AsyncRoom): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
