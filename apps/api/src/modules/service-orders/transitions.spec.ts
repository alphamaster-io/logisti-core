import { SERVICE_ORDER_TRANSITIONS, canTransitionServiceOrder } from '@logisti-core/shared';

describe('ServiceOrder state machine', () => {
  it('allows DRAFT → DEPOSIT_COLLECTED', () => {
    expect(canTransitionServiceOrder('DRAFT', 'DEPOSIT_COLLECTED')).toBe(true);
  });

  it('allows DRAFT → CANCELLED', () => {
    expect(canTransitionServiceOrder('DRAFT', 'CANCELLED')).toBe(true);
  });

  it('refuses DRAFT → DELIVERED (must walk through the pipeline)', () => {
    expect(canTransitionServiceOrder('DRAFT', 'DELIVERED')).toBe(false);
  });

  it('refuses CANCELLED → anything (terminal)', () => {
    expect(SERVICE_ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('refuses DELIVERED → anything (terminal)', () => {
    expect(SERVICE_ORDER_TRANSITIONS.DELIVERED).toEqual([]);
  });

  it('refuses ABANDONED → anything (terminal)', () => {
    expect(SERVICE_ORDER_TRANSITIONS.ABANDONED).toEqual([]);
  });

  it('allows PENDING_ABANDONMENT → PAID_IN_FULL (last-chance recovery)', () => {
    expect(canTransitionServiceOrder('PENDING_ABANDONMENT', 'PAID_IN_FULL')).toBe(true);
  });

  it('covers every status in the transition map', () => {
    const statuses: Array<keyof typeof SERVICE_ORDER_TRANSITIONS> = [
      'DRAFT',
      'DEPOSIT_COLLECTED',
      'STORED',
      'PACKING_SCHEDULED',
      'PACKED',
      'AWAITING_FULL_PAYMENT',
      'PAID_IN_FULL',
      'OVERDUE',
      'IN_WAREHOUSE',
      'PALLETIZED',
      'SHIPPED',
      'DELIVERED',
      'FAILED_DELIVERY',
      'PENDING_ABANDONMENT',
      'ABANDONED',
      'CANCELLED',
    ];
    for (const s of statuses) {
      expect(SERVICE_ORDER_TRANSITIONS[s]).toBeDefined();
    }
  });
});
