import { BadRequestException } from '@nestjs/common';
import { validateModeRequiredFields } from './mode-validation';
import type { CreateServiceOrderDto } from '@logisti-core/shared';

const baseCustomer = {
  surname: 'Lee',
  givenName: 'Maria',
  contactNumbers: ['+85291234567'],
};
const baseConsignee = {
  surname: 'Reyes',
  givenName: 'Ana',
  contactNumbers: ['+639171234567'],
  address: { city: 'Cebu City', province: 'Cebu', street: 'P. Burgos' },
};

describe('validateModeRequiredFields', () => {
  it('accepts a valid deliver_box payload', () => {
    expect(() =>
      validateModeRequiredFields({
        mode: 'DELIVER_BOX',
        branchId: 'b',
        customerSnapshot: baseCustomer,
        consigneeSnapshot: baseConsignee,
        pickupAddress: { building: 'Mei Foo', district: 'Kowloon' },
        scheduledPickupAt: new Date(),
      } satisfies CreateServiceOrderDto),
    ).not.toThrow();
  });

  it('rejects deliver_box without pickup address', () => {
    expect(() =>
      validateModeRequiredFields({
        mode: 'DELIVER_BOX',
        branchId: 'b',
        customerSnapshot: baseCustomer,
        consigneeSnapshot: baseConsignee,
        scheduledPickupAt: new Date(),
      } satisfies CreateServiceOrderDto),
    ).toThrow(BadRequestException);
  });

  it('accepts pick_up_box without extra fields', () => {
    expect(() =>
      validateModeRequiredFields({
        mode: 'PICK_UP_BOX',
        branchId: 'b',
        customerSnapshot: baseCustomer,
        consigneeSnapshot: baseConsignee,
      } satisfies CreateServiceOrderDto),
    ).not.toThrow();
  });

  it('rejects agent_intake and macau_intake for now', () => {
    for (const mode of ['AGENT_INTAKE', 'MACAU_INTAKE'] as const) {
      expect(() =>
        validateModeRequiredFields({
          mode,
          branchId: 'b',
          customerSnapshot: baseCustomer,
          consigneeSnapshot: baseConsignee,
        } satisfies CreateServiceOrderDto),
      ).toThrow(BadRequestException);
    }
  });
});
