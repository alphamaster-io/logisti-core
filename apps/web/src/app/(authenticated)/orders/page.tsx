'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse } from '@logisti-core/shared';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { formatDate } from '@/lib/utils';

// Minimal row shape the list needs (the API returns the full ServiceOrder).
type OrderRow = {
  id: string;
  number: string;
  mode: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'destructive' | 'default'> = {
  DRAFT: 'secondary',
  DEPOSIT_COLLECTED: 'default',
  PACKED: 'default',
  PAID_IN_FULL: 'success',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  ABANDONED: 'destructive',
  OVERDUE: 'destructive',
};

const MODE_OPTIONS = [
  'ALL',
  'DELIVER_BOX',
  'PICK_UP_BOX',
  'INSTANT_PACK',
  'STORAGE',
  'AGENT_INTAKE',
  'MACAU_INTAKE',
];

export default function OrdersPage() {
  const [mode, setMode] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');

  const params = new URLSearchParams();
  params.set('limit', '50');
  if (mode !== 'ALL') params.set('mode', mode);
  if (status !== 'ALL') params.set('status', status);

  const query = useQuery({
    queryKey: ['service-orders', mode, status],
    queryFn: () =>
      api.get<PaginatedResponse<OrderRow>>(`/api/proxy/service-orders?${params.toString()}`),
    retry: false,
  });

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: 'number',
      header: 'Order #',
      cell: (r) => (
        <Link href={`/orders/${r.id}`} className="font-mono font-medium hover:underline">
          {r.number}
        </Link>
      ),
    },
    { key: 'mode', header: 'Mode', cell: (r) => <Badge variant="secondary">{r.mode}</Badge> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{r.status}</Badge>,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.paymentStatus}</span>,
    },
    { key: 'createdAt', header: 'Created', cell: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Orders</h1>
          <p className="text-sm text-muted-foreground">
            Customer engagements — intake, boxes, payments, dispatch.
          </p>
        </div>
        <CreateOrderDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="w-48" aria-label="Filter by mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>
                {m === 'ALL' ? 'All modes' : m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['ALL', 'DRAFT', 'DEPOSIT_COLLECTED', 'PACKED', 'PAID_IN_FULL', 'CANCELLED'].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s === 'ALL' ? 'All statuses' : s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        rowKey={(r) => r.id}
        loading={query.isPending}
        emptyMessage="No service orders yet"
        hasMore={false}
      />
    </div>
  );
}
