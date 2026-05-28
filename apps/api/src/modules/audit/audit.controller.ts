import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { type AuditService } from './audit.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiBearerAuth('access-token')
@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listForTenant(
      user.tenantId,
      Math.min(parseInt(limit ?? '50', 10) || 50, 200),
      cursor,
    );
  }
}
