'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type BoxType = {
  id: string;
  code: string;
  displayName: string;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  loyaltyPointsPerBox: number;
  liabilityCapAmount: string | null;
  liabilityCapCurrency: string | null;
};
type Accessory = {
  code: string;
  displayName: string;
  amountMinor: string;
  currencyCode: string;
};
type BoxPrice = {
  boxTypeId: string;
  regionZone: string;
  currencyCode: string;
  amountMinor: string;
  serviceMode: string | null;
  isDiscount: boolean;
};

const ZONES = ['MNL_RIZAL', 'LUZON_A', 'LUZON_B', 'BICOL_VISAYAS', 'MINDANAO_ISLANDS'] as const;

function money(minor: string | null): string {
  if (minor == null) return '—';
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${major}.${cents}`;
}

function PriceCell({
  prices,
  boxTypeId,
  zone,
}: {
  prices: BoxPrice[];
  boxTypeId: string;
  zone: string;
}) {
  // Regular PHP price = matching row with serviceMode null and currencyCode PHP.
  const p = prices.find(
    (x) =>
      x.boxTypeId === boxTypeId &&
      x.regionZone === zone &&
      x.currencyCode === 'PHP' &&
      x.serviceMode === null,
  );
  return <span className="font-mono">{p ? money(p.amountMinor) : '—'}</span>;
}

export default function CatalogPage() {
  const types = useQuery({
    queryKey: ['box-types'],
    queryFn: () => api.get<BoxType[]>('/api/proxy/box-catalog/box-types'),
    retry: false,
  });
  // The /box-prices endpoint requires query params for a single lookup; here
  // we use the per-type detail (which embeds active prices) by fetching every
  // type in parallel via the by-code endpoint. The list itself is small.
  const allPrices = useQuery({
    queryKey: ['box-prices-all'],
    enabled: types.data !== undefined,
    queryFn: async () => {
      const rows: BoxPrice[] = [];
      for (const t of types.data ?? []) {
        const detail = await api.get<BoxType & { prices: BoxPrice[] }>(
          `/api/proxy/box-catalog/box-types/${t.code}`,
        );
        for (const p of detail.prices) rows.push(p);
      }
      return rows;
    },
    retry: false,
  });
  const accessories = useQuery({
    queryKey: ['accessories'],
    queryFn: () => api.get<Accessory[]>('/api/proxy/box-catalog/accessories'),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Box catalog</h1>
        <p className="text-sm text-muted-foreground">
          Live pricing matrix — boxes by PH region zone, accessories, and liability caps.
        </p>
      </div>

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-3 font-semibold">Boxes &amp; PH freight (PHP)</h2>
        {types.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Dimensions (in)</th>
                <th className="py-1 pr-2">Stamps</th>
                <th className="py-1 pr-2">Liability</th>
                {ZONES.map((z) => (
                  <th key={z} className="py-1 pr-2 text-right font-medium">
                    {z}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(types.data ?? []).map((t) => (
                <tr key={t.code} className="border-t">
                  <td className="py-1 pr-2 font-mono font-medium">{t.code}</td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {t.lengthIn != null
                      ? `${t.lengthIn}×${t.widthIn}×${t.heightIn}`
                      : 'by quotation'}
                  </td>
                  <td className="py-1 pr-2">{t.loyaltyPointsPerBox}</td>
                  <td className="py-1 pr-2">
                    {t.liabilityCapAmount
                      ? `${t.liabilityCapCurrency} ${money(t.liabilityCapAmount)}`
                      : '—'}
                  </td>
                  {ZONES.map((z) => (
                    <td key={z} className="py-1 pr-2 text-right">
                      <PriceCell prices={allPrices.data ?? []} boxTypeId={t.id} zone={z} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Accessories (HKD)</h2>
        {accessories.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {(accessories.data ?? []).map((a) => (
              <li
                key={a.code}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span>{a.displayName}</span>
                <Badge variant="outline" className="font-mono">
                  {a.currencyCode} {money(a.amountMinor)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
