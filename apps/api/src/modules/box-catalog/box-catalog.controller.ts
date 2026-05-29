import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@logisti-core/shared';
import type {
  BoxTypeCode,
  RegionZone,
  ServiceMode,
  TvSizeBracket,
  AccessoryCode,
} from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BoxCatalogService } from './box-catalog.service';

@ApiBearerAuth('access-token')
@ApiTags('box-catalog')
@Controller('box-catalog')
export class BoxCatalogController {
  constructor(private readonly svc: BoxCatalogService) {}

  @Get('box-types')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  listBoxTypes() {
    return this.svc.listBoxTypes();
  }

  @Get('box-types/:code')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  getBoxType(@Param('code') code: BoxTypeCode) {
    return this.svc.getBoxType(code);
  }

  @Get('box-prices')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  lookupBoxPrice(
    @Query('boxTypeCode') boxTypeCode: BoxTypeCode,
    @Query('regionZone') regionZone: RegionZone,
    @Query('currencyCode') currencyCode: string,
    @Query('serviceMode') serviceMode?: ServiceMode,
  ) {
    return this.svc.lookupBoxPrice({ boxTypeCode, regionZone, currencyCode, serviceMode });
  }

  @Get('accessories')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  listAccessories() {
    return this.svc.listAccessories();
  }

  @Get('accessories/:code')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  getAccessory(@Param('code') code: AccessoryCode) {
    return this.svc.getAccessory(code);
  }

  @Get('tv-prices')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  listTvPrices(
    @Query('sizeBracket') sizeBracket?: TvSizeBracket,
    @Query('regionZone') regionZone?: RegionZone,
    @Query('currencyCode') currencyCode?: string,
  ) {
    if (sizeBracket && regionZone && currencyCode) {
      return this.svc.lookupTvPrice({ sizeBracket, regionZone, currencyCode });
    }
    return this.svc.listTvPrices();
  }

  @Get('region-zones')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  listZones() {
    return this.svc.listRegionZoneMap();
  }

  @Get('region-zones/resolve')
  @Permissions(PERMISSIONS.BOX_CATALOG_READ)
  async resolveZone(@Query('province') province: string) {
    const zone = await this.svc.resolveZone(province);
    return { province, zone };
  }
}
