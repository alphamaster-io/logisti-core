import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiBearerAuth('access-token')
@ApiTags('rbac')
@Controller('rbac')
export class RbacController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  @Permissions(PERMISSIONS.ROLES_READ)
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });
    return roles.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp) => rp.permission.key),
    }));
  }

  @Get('permissions')
  @Permissions(PERMISSIONS.ROLES_READ)
  async listPermissions() {
    const perms = await this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
    return perms.map((p) => ({ key: p.key, description: p.description }));
  }
}
