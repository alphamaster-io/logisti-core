import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@logisti-core/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { type PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiBearerAuth('access-token')
@ApiTags('warehouse')
@Controller()
export class WarehouseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('branches')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.branch.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        region: true,
        timezone: true,
        address: true,
        isActive: true,
      },
    });
  }

  @Get('warehouses')
  @Permissions(PERMISSIONS.WAREHOUSES_READ)
  async listWarehouses(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.warehouse.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { code: 'asc' },
      include: { branch: { select: { id: true, code: true, name: true } } },
    });
  }

  @Get('warehouses/:id/zones')
  @Permissions(PERMISSIONS.WAREHOUSES_READ)
  async listZones(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.warehouseZone.findMany({
      where: { warehouseId: id, tenantId: user.tenantId },
      orderBy: { code: 'asc' },
    });
  }

  @Get('zones/:id/racks')
  @Permissions(PERMISSIONS.WAREHOUSES_READ)
  async listRacks(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.rack.findMany({
      where: { zoneId: id, tenantId: user.tenantId },
      orderBy: { code: 'asc' },
    });
  }

  @Get('racks/:id/bins')
  @Permissions(PERMISSIONS.WAREHOUSES_READ)
  async listBins(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.bin.findMany({
      where: { rackId: id, tenantId: user.tenantId },
      orderBy: { code: 'asc' },
    });
  }
}
