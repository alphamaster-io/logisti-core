import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, createBoxSchema, updateBoxSchema } from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BoxesService } from './boxes.service';

@ApiBearerAuth('access-token')
@ApiTags('boxes')
@Controller()
export class BoxesController {
  constructor(private readonly svc: BoxesService) {}

  @Post('service-orders/:orderId/boxes')
  @Permissions(PERMISSIONS.BOXES_CREATE)
  async addToOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = createBoxSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.flatten() });
    }
    return this.svc.addToOrder(user, orderId, parsed.data);
  }

  @Get('service-orders/:orderId/boxes')
  @Permissions(PERMISSIONS.BOXES_READ)
  async listForOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.svc.listForOrder(user, orderId);
  }

  @Get('boxes/by-number/:number')
  @Permissions(PERMISSIONS.BOXES_READ)
  async getByNumber(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    return this.svc.getByNumber(user, number);
  }

  @Get('boxes/:id')
  @Permissions(PERMISSIONS.BOXES_READ)
  async getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getById(user, id);
  }

  @Patch('boxes/:id')
  @Permissions(PERMISSIONS.BOXES_MANAGE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateBoxSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.flatten() });
    }
    return this.svc.update(user, id, parsed.data);
  }

  @Delete('boxes/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.BOXES_MANAGE)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.svc.remove(user, id);
  }
}
