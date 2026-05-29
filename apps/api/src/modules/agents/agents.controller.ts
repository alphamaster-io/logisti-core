import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createAgentSchema,
  issueBatchSchema,
  updateAgentSchema,
} from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RequireIdempotency } from '../../common/decorators/require-idempotency.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AgentsService } from './agents.service';

@ApiBearerAuth('access-token')
@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly svc: AgentsService) {}

  @Get()
  @Permissions(PERMISSIONS.AGENTS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('active') active?: string,
  ) {
    const parsedActive = active === undefined ? undefined : active === 'true';
    return this.svc.list(user, { branchId, active: parsedActive });
  }

  @Post()
  @Permissions(PERMISSIONS.AGENTS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const p = createAgentSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.create(user, p.data);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AGENTS_READ)
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getById(user, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.AGENTS_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const p = updateAgentSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.update(user, id, p.data);
  }

  @Get(':id/batches')
  @Permissions(PERMISSIONS.AGENTS_READ)
  listBatches(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.listBatches(user, id);
  }

  @Post(':id/batches')
  @Permissions(PERMISSIONS.AGENTS_ISSUE_BATCH)
  @RequireIdempotency()
  issueBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = issueBatchSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.issueBatch(user, id, p.data);
  }

  @Post('batches/:batchId/void')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AGENTS_MANAGE)
  voidBatch(@CurrentUser() user: AuthenticatedUser, @Param('batchId') batchId: string) {
    return this.svc.voidBatch(user, batchId);
  }

  @Post('batches/:batchId/allocate-next')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AGENTS_MANAGE)
  @RequireIdempotency()
  allocateNext(@CurrentUser() user: AuthenticatedUser, @Param('batchId') batchId: string) {
    return this.svc.allocateNextNumber(user, batchId);
  }
}
