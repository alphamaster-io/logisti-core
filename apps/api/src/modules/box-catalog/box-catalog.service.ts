import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BoxTypeCode,
  RegionZone,
  ServiceMode,
  TvSizeBracket,
  AccessoryCode,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BoxCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listBoxTypes() {
    return this.prisma.boxType.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async getBoxType(code: BoxTypeCode) {
    const t = await this.prisma.boxType.findFirst({
      where: { code, deletedAt: null },
      include: {
        prices: {
          where: { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
          orderBy: [{ regionZone: 'asc' }, { currencyCode: 'asc' }, { serviceMode: 'asc' }],
        },
      },
    });
    if (!t) throw new NotFoundException(`box type ${code} not found`);
    return t;
  }

  lookupBoxPrice(args: {
    boxTypeCode: BoxTypeCode;
    regionZone: RegionZone;
    currencyCode: string;
    serviceMode?: ServiceMode;
  }) {
    return this.prisma.boxPrice.findFirst({
      where: {
        boxType: { code: args.boxTypeCode },
        regionZone: args.regionZone,
        currencyCode: args.currencyCode,
        serviceMode: args.serviceMode ?? null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  listAccessories() {
    return this.prisma.accessory.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async getAccessory(code: AccessoryCode) {
    const a = await this.prisma.accessory.findFirst({
      where: { code, deletedAt: null },
    });
    if (!a) throw new NotFoundException(`accessory ${code} not found`);
    return a;
  }

  listTvPrices() {
    return this.prisma.tvPrice.findMany({
      where: { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      orderBy: [{ sizeBracket: 'asc' }, { regionZone: 'asc' }],
    });
  }

  lookupTvPrice(args: {
    sizeBracket: TvSizeBracket;
    regionZone: RegionZone;
    currencyCode: string;
  }) {
    return this.prisma.tvPrice.findFirst({
      where: {
        sizeBracket: args.sizeBracket,
        regionZone: args.regionZone,
        currencyCode: args.currencyCode,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  listRegionZoneMap() {
    return this.prisma.regionZoneMap.findMany({ orderBy: { province: 'asc' } });
  }

  async resolveZone(province: string): Promise<RegionZone | null> {
    const row = await this.prisma.regionZoneMap.findUnique({ where: { province } });
    return row?.zone ?? null;
  }
}
