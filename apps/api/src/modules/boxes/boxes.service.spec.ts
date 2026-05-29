import { ConflictException, NotFoundException } from '@nestjs/common';
import { BoxesService } from './boxes.service';

describe('BoxesService', () => {
  const user = { id: 'u1', tenantId: 't1' } as never;
  const prisma = {
    serviceOrder: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    boxType: {
      findUnique: jest.fn(),
    },
    box: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof BoxesService>[0];

  const svc = new BoxesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  describe('addToOrder', () => {
    it('refuses when the order is not in an editable state', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        id: 'o1',
        status: 'PACKED',
      });
      await expect(svc.addToOrder(user, 'o1', { boxTypeCode: 'KING' } as never)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.box.create).not.toHaveBeenCalled();
    });

    it('refuses when the box type is missing', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        id: 'o1',
        status: 'DRAFT',
      });
      (prisma.boxType.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(svc.addToOrder(user, 'o1', { boxTypeCode: 'KING' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a box with a B- prefix number when the order is DRAFT', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        id: 'o1',
        status: 'DRAFT',
      });
      (prisma.boxType.findUnique as jest.Mock).mockResolvedValue({
        code: 'KING',
        isActive: true,
        deletedAt: null,
      });
      (prisma.box.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'b1',
        ...data,
      }));

      const out = await svc.addToOrder(user, 'o1', {
        boxTypeCode: 'KING',
        weightKg: 12.5,
      } as never);

      expect(out.id).toBe('b1');
      const call = (prisma.box.create as jest.Mock).mock.calls[0]![0];
      expect(call.data.number).toMatch(/^B-[A-NP-Z2-9]{16}$/);
      expect(call.data.serviceOrderId).toBe('o1');
      expect(call.data.boxTypeCode).toBe('KING');
      expect(call.data.tenantId).toBe('t1');
      expect(call.data.createdBy).toBe('u1');
    });
  });

  describe('remove', () => {
    it('refuses when the box is past CREATED', async () => {
      (prisma.box.findFirst as jest.Mock).mockResolvedValue({
        id: 'b1',
        status: 'RECEIVED',
        serviceOrderId: 'o1',
      });
      await expect(svc.remove(user, 'b1')).rejects.toThrow(ConflictException);
    });

    it('refuses when the order is past DEPOSIT_COLLECTED', async () => {
      (prisma.box.findFirst as jest.Mock).mockResolvedValue({
        id: 'b1',
        status: 'CREATED',
        serviceOrderId: 'o1',
      });
      (prisma.serviceOrder.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        status: 'PACKED',
      });
      await expect(svc.remove(user, 'b1')).rejects.toThrow(ConflictException);
    });

    it('soft-deletes a CREATED box on a DRAFT order', async () => {
      (prisma.box.findFirst as jest.Mock).mockResolvedValue({
        id: 'b1',
        status: 'CREATED',
        serviceOrderId: 'o1',
      });
      (prisma.serviceOrder.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        status: 'DRAFT',
      });
      await svc.remove(user, 'b1');
      const call = (prisma.box.update as jest.Mock).mock.calls[0]![0];
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
