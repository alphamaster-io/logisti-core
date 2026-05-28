import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@logisti-core/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UsersService } from './users.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import {
  AssignRoleDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateMeDto,
  UpdateUserDto,
} from './dto/users.dto';

@ApiBearerAuth('access-token')
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: "Current user's profile" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListUsersQueryDto) {
    return this.users.list(user, q);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USERS_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.findOne(user, id);
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_CREATE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.USERS_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @Post(':id/disable')
  @Permissions(PERMISSIONS.USERS_DISABLE)
  disable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.disable(user, id);
  }

  @Post(':id/enable')
  @Permissions(PERMISSIONS.USERS_DISABLE)
  enable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.enable(user, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.USERS_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.softDelete(user, id);
  }

  @Post(':id/roles')
  @Permissions(PERMISSIONS.USERS_UPDATE)
  @ApiOperation({ summary: 'Assign a role to a user (master can assign to anyone)' })
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.users.assignRole(user, id, dto.roleKey);
  }

  @Delete(':id/roles/:roleKey')
  @Permissions(PERMISSIONS.USERS_UPDATE)
  revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('roleKey') roleKey: string,
  ) {
    return this.users.revokeRole(user, id, roleKey);
  }
}
