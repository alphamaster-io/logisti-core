import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express' {
  interface Request {
    id?: string;
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const id = incoming && incoming.length <= 200 ? incoming : randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
