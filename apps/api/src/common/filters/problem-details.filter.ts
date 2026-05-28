import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface RequestWithId extends Request {
  id?: string;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        title = resp;
      } else if (typeof resp === 'object' && resp !== null) {
        const body = resp as Record<string, unknown>;
        title = (body['error'] as string | undefined) ?? exception.message;
        const msg = body['message'];
        if (Array.isArray(msg)) {
          detail = msg.join('; ');
          errors = { _: msg as string[] };
        } else if (typeof msg === 'string') {
          detail = msg;
        }
      } else {
        title = exception.message;
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
      this.logger.error(exception.stack);
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://logisti-core.dev/errors/${status}`,
        title,
        status,
        detail,
        instance: req.originalUrl,
        errors,
        requestId: req.id,
      });
  }
}
