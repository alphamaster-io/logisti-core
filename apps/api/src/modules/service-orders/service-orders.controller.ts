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
import type { ServiceMode, ServiceOrderStatus } from '@prisma/client';
import {
  PERMISSIONS,
  cancelServiceOrderSchema,
  createServiceOrderSchema,
  updateServiceOrderSchema,
} from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ServiceOrdersService } from './service-orders.service';

@ApiBearerAuth('access-token')
@ApiTags('service-orders')
@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private readonly svc: ServiceOrdersService) {}

  @Post()
  @Permissions(PERMISSIONS.SERVICE_ORDERS_CREATE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = createServiceOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.flatten() });
    }
    return this.svc.create(user, parsed.data);
  }

  @Get()
  @Permissions(PERMISSIONS.SERVICE_ORDERS_READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ServiceOrderStatus,
    @Query('mode') mode?: ServiceMode,
    @Query('branchId') branchId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user, {
      status,
      mode,
      branchId,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('by-number/:number')
  @Permissions(PERMISSIONS.SERVICE_ORDERS_READ)
  async getByNumber(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    return this.svc.getByNumber(user, number);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SERVICE_ORDERS_READ)
  async getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getById(user, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.SERVICE_ORDERS_MANAGE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateServiceOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.flatten() });
    }
    return this.svc.update(user, id, parsed.data);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions(PERMISSIONS.SERVICE_ORDERS_MANAGE)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = cancelServiceOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.flatten() });
    }
    return this.svc.cancel(user, id, parsed.data.reason);
  }
}
