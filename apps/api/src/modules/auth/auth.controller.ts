import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import type { AuthenticatedUser } from './types/authenticated-user';
import {
  type LoginDto,
  type PasswordResetConfirmDto,
  type PasswordResetRequestDto,
  type RefreshDto,
  type SwitchBranchDto,
  type SwitchRoleDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @SkipAudit('audited by AuthService internally; body would contain credentials')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password login' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Public()
  @SkipAudit('refresh tokens are opaque; would log secret material')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @Public()
  @SkipAudit('returns success regardless to avoid user enumeration')
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  requestReset(@Body() dto: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  confirmReset(@Body() dto: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.newPassword);
  }

  @Post('switch-role')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Master users: assume a single role for impersonation testing' })
  switchRole(@CurrentUser() user: AuthenticatedUser, @Body() dto: SwitchRoleDto) {
    return this.auth.switchRole(user.id, dto.roleKey);
  }

  @Post('switch-branch')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Switch active branch context (master: any branch, others: own only)' })
  switchBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: SwitchBranchDto) {
    return this.auth.switchBranch(user.id, dto.branchId);
  }
}
