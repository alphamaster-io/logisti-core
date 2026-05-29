import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  correctLineSchema,
  recordChargeSchema,
  recordPaymentSchema,
} from '@logisti-core/shared';
import { z } from 'zod';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RequireIdempotency } from '../../common/decorators/require-idempotency.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PaymentsService } from './payments.service';

const collectDepositSchema = z.object({
  perBoxMinor: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  currencyCode: z.string().min(3).max(3),
});

@ApiBearerAuth('access-token')
@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get('service-orders/:orderId/payment-lines')
  @Permissions(PERMISSIONS.PAYMENTS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.svc.listForOrder(user, orderId);
  }

  @Get('service-orders/:orderId/balance')
  @Permissions(PERMISSIONS.PAYMENTS_READ)
  balance(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.svc.balance(user, orderId);
  }

  @Post('service-orders/:orderId/charges')
  @Permissions(PERMISSIONS.PAYMENTS_MANAGE)
  @RequireIdempotency()
  charge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const p = recordChargeSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.recordCharge(user, orderId, p.data);
  }

  @Post('service-orders/:orderId/payments')
  @Permissions(PERMISSIONS.PAYMENTS_MANAGE)
  @RequireIdempotency()
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const p = recordPaymentSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.recordPayment(user, orderId, p.data);
  }

  @Post('service-orders/:orderId/collect-deposit')
  @Permissions(PERMISSIONS.PAYMENTS_MANAGE)
  @RequireIdempotency()
  collectDeposit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const p = collectDepositSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.collectDeposit(user, orderId, p.data.perBoxMinor, p.data.currencyCode);
  }

  @Post('payment-lines/:lineId/correct')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYMENTS_ADJUST)
  @RequireIdempotency()
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    const p = correctLineSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.correct(user, lineId, p.data.reason);
  }

  @Post('payment-lines/:lineId/bounce')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYMENTS_ADJUST)
  @RequireIdempotency()
  bounce(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    const p = correctLineSchema.safeParse(body);
    if (!p.success) throw new BadRequestException({ message: p.error.flatten() });
    return this.svc.bounce(user, lineId, p.data.reason);
  }
}
