import { BoxCatalogService } from './box-catalog.service';

describe('BoxCatalogService', () => {
  const prisma = {
    boxType: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    boxPrice: {
      findFirst: jest.fn(),
    },
    accessory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    tvPrice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    regionZoneMap: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof BoxCatalogService>[0];

  const svc = new BoxCatalogService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('lists active box types ordered by code', async () => {
    (prisma.boxType.findMany as jest.Mock).mockResolvedValue([
      { id: '1', code: 'EX_BUDGET' },
      { id: '2', code: 'KING' },
    ]);
    const out = await svc.listBoxTypes();
    expect(prisma.boxType.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
    expect(out).toHaveLength(2);
  });

  it('throws 404 when box type missing', async () => {
    (prisma.boxType.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.getBoxType('KING' as never)).rejects.toThrow(/not found/i);
  });

  it('looks up a box price by zone + currency + mode', async () => {
    (prisma.boxPrice.findFirst as jest.Mock).mockResolvedValue({ amountMinor: 103500n });
    const out = await svc.lookupBoxPrice({
      boxTypeCode: 'KING' as never,
      regionZone: 'MNL_RIZAL' as never,
      currencyCode: 'PHP',
    });
    expect(out?.amountMinor).toBe(103500n);
    const call = (prisma.boxPrice.findFirst as jest.Mock).mock.calls[0]![0];
    expect(call.where.serviceMode).toBeNull();
  });

  it('looks up a discount price when serviceMode given', async () => {
    (prisma.boxPrice.findFirst as jest.Mock).mockResolvedValue({
      amountMinor: 12000n,
      isDiscount: true,
    });
    await svc.lookupBoxPrice({
      boxTypeCode: 'KING' as never,
      regionZone: 'MNL_RIZAL' as never,
      currencyCode: 'HKD',
      serviceMode: 'INSTANT_PACK' as never,
    });
    const call = (prisma.boxPrice.findFirst as jest.Mock).mock.calls[0]![0];
    expect(call.where.serviceMode).toBe('INSTANT_PACK');
    expect(call.where.currencyCode).toBe('HKD');
  });

  it('resolves a province to its region zone', async () => {
    (prisma.regionZoneMap.findUnique as jest.Mock).mockResolvedValue({ zone: 'BICOL_VISAYAS' });
    const out = await svc.resolveZone('Leyte');
    expect(out).toBe('BICOL_VISAYAS');
  });

  it('returns null for an unknown province', async () => {
    (prisma.regionZoneMap.findUnique as jest.Mock).mockResolvedValue(null);
    const out = await svc.resolveZone('Atlantis');
    expect(out).toBeNull();
  });
});
