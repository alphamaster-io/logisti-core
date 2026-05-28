import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { SKIP_AUDIT_KEY } from '../../common/decorators/skip-audit.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface ReqLike {
  method: string;
  originalUrl: string;
  user?: AuthenticatedUser;
  ip?: string;
  id?: string;
  body?: unknown;
  header(name: string): string | undefined;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<string>(SKIP_AUDIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const httpCtx = ctx.switchToHttp();
    const req = httpCtx.getRequest<ReqLike>();

    if (skip || !MUTATING_METHODS.has(req.method) || !this.audit) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (response) => {
          // fire-and-forget — never fail the request because of audit logging
          this.audit
            ?.record({
              tenantId: req.user?.tenantId ?? null,
              userId: req.user?.id ?? null,
              action: `${req.method.toLowerCase()} ${req.originalUrl}`,
              entityType: ctx
                .getClass()
                .name.replace(/Controller$/, '')
                .toLowerCase(),
              entityId: this.guessEntityId(response, req),
              after: this.safeJson(response),
              ip: req.ip ?? null,
              userAgent: req.header('user-agent') ?? null,
              requestId: req.id ?? null,
            })
            .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
        },
      }),
    );
  }

  private guessEntityId(response: unknown, req: ReqLike): string | null {
    if (response && typeof response === 'object' && 'id' in response) {
      const id = (response as { id: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    const match = /\/([a-z0-9-_]+)(?:\/[^/]+)?$/i.exec(req.originalUrl);
    return match?.[1] ?? null;
  }

  private safeJson(v: unknown): Prisma.InputJsonValue | undefined {
    if (v === null || v === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }
}
