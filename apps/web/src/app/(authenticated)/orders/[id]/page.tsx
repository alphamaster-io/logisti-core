'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, newIdempotencyKey } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaymentEntryDialog } from '@/components/orders/payment-entry-dialog';
import { formatDate } from '@/lib/utils';

type Order = {
  id: string;
  number: string;
  mode: string;
  status: string;
  paymentStatus: string;
  customerSnapshot: { surname?: string; givenName?: string; contactNumbers?: string[] };
  consigneeSnapshot: {
    surname?: string;
    givenName?: string;
    address?: { city?: string; province?: string };
  };
  createdAt: string;
};
type Box = {
  id: string;
  number: string;
  boxTypeCode: string;
  status: string;
  weightKg: string | null;
};
type Balance = {
  currencyCode: string;
  totalCharges: string;
  totalReceipts: string;
  balanceDue: string;
};

const BOX_TYPES = ['KING', 'SUPER', 'JUMBO', 'REGULAR', 'MEDIUM', 'SMALL', 'EX_BUDGET'];

function money(minor: string): string {
  const n = BigInt(minor || '0');
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${major}.${cents}`;
}

type ActiveBatch = {
  id: string;
  agentId: string;
  agentCode: string;
  agentName: string;
  prefix: string;
  nextSeq: number;
  endSeq: number;
  remaining: number;
};

const SYSTEM_BATCH_VALUE = '__system__';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [boxType, setBoxType] = React.useState('KING');
  const [batchId, setBatchId] = React.useState<string>(SYSTEM_BATCH_VALUE);

  const order = useQuery({
    queryKey: ['service-order', id],
    queryFn: () => api.get<Order>(`/api/proxy/service-orders/${id}`),
    retry: false,
  });
  const boxes = useQuery({
    queryKey: ['order-boxes', id],
    queryFn: () => api.get<Box[]>(`/api/proxy/service-orders/${id}/boxes`),
    retry: false,
  });
  const balance = useQuery({
    queryKey: ['order-balance', id],
    queryFn: () => api.get<Balance[]>(`/api/proxy/service-orders/${id}/balance`),
    retry: false,
  });

  const isAgentIntake = order.data?.mode === 'AGENT_INTAKE';
  const activeBatches = useQuery({
    queryKey: ['active-batches'],
    queryFn: () => api.get<ActiveBatch[]>('/api/proxy/agents/batches/active'),
    retry: false,
    enabled: isAgentIntake,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['service-order', id] });
    qc.invalidateQueries({ queryKey: ['order-boxes', id] });
    qc.invalidateQueries({ queryKey: ['order-balance', id] });
    if (isAgentIntake) qc.invalidateQueries({ queryKey: ['active-batches'] });
  };

  const addBox = useMutation({
    mutationFn: () => {
      const body: { boxTypeCode: string; batchId?: string } = { boxTypeCode: boxType };
      if (batchId !== SYSTEM_BATCH_VALUE) body.batchId = batchId;
      return api.post(`/api/proxy/service-orders/${id}/boxes`, body, {
        'Idempotency-Key': newIdempotencyKey(),
      });
    },
    onSuccess: () => {
      toast.success('Box added');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const removeBox = useMutation({
    mutationFn: (boxId: string) => api.delete(`/api/proxy/boxes/${boxId}`),
    onSuccess: () => {
      toast.success('Box removed');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const collectDeposit = useMutation({
    mutationFn: () =>
      api.post(
        `/api/proxy/service-orders/${id}/collect-deposit`,
        { perBoxMinor: 5000, currencyCode: 'HKD' },
        { 'Idempotency-Key': newIdempotencyKey() },
      ),
    onSuccess: () => {
      toast.success('Deposit collected (HKD$50/box)');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post(`/api/proxy/service-orders/${id}/cancel`, { reason: 'cancelled from UI' }),
    onSuccess: () => {
      toast.success('Order cancelled');
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (order.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (order.isError || !order.data) return <p className="text-destructive">Order not found.</p>;

  const o = order.data;
  const editable = o.status === 'DRAFT' || o.status === 'DEPOSIT_COLLECTED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{o.number}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{o.mode}</Badge>
            <Badge>{o.status}</Badge>
            <Badge variant="outline">{o.paymentStatus}</Badge>
            <span className="text-sm text-muted-foreground">{formatDate(o.createdAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {o.status === 'DRAFT' && (
            <Button
              variant="outline"
              onClick={() => collectDeposit.mutate()}
              disabled={collectDeposit.isPending}
            >
              Collect deposit
            </Button>
          )}
          {editable && (
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm('Cancel this order? Deposits are non-refundable.')) {
                  cancel.mutate();
                }
              }}
              disabled={cancel.isPending}
            >
              Cancel order
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-1 p-4">
          <h2 className="font-semibold">Customer (sender)</h2>
          <p className="text-sm">
            {o.customerSnapshot.givenName} {o.customerSnapshot.surname}
          </p>
          <p className="text-sm text-muted-foreground">
            {o.customerSnapshot.contactNumbers?.join(', ')}
          </p>
        </Card>
        <Card className="space-y-1 p-4">
          <h2 className="font-semibold">Consignee (receiver)</h2>
          <p className="text-sm">
            {o.consigneeSnapshot.givenName} {o.consigneeSnapshot.surname}
          </p>
          <p className="text-sm text-muted-foreground">
            {[o.consigneeSnapshot.address?.city, o.consigneeSnapshot.address?.province]
              .filter(Boolean)
              .join(', ')}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Boxes ({boxes.data?.length ?? 0})</h2>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={boxType} onValueChange={setBoxType}>
                <SelectTrigger className="w-40" aria-label="Box type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAgentIntake && (
                <Select value={batchId} onValueChange={setBatchId}>
                  <SelectTrigger className="w-64" aria-label="Agent batch">
                    <SelectValue placeholder="System number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SYSTEM_BATCH_VALUE}>System number (no batch)</SelectItem>
                    {activeBatches.data?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.agentCode} — {b.prefix} (next #{b.nextSeq}, {b.remaining} left)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={() => addBox.mutate()} disabled={addBox.isPending}>
                Add box
              </Button>
            </div>
          )}
        </div>
        {boxes.data && boxes.data.length > 0 ? (
          <ul className="divide-y">
            {boxes.data.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span className="font-mono text-sm">{b.number}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{b.boxTypeCode}</Badge>
                  <Badge variant="outline">{b.status}</Badge>
                  {editable && b.status === 'CREATED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeBox.mutate(b.id)}
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No boxes yet.</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Balance</h2>
          <div className="flex gap-2">
            <PaymentEntryDialog
              orderId={id}
              mode="charge"
              trigger={
                <Button size="sm" variant="outline">
                  Add charge
                </Button>
              }
            />
            <PaymentEntryDialog
              orderId={id}
              mode="payment"
              trigger={<Button size="sm">Record payment</Button>}
            />
          </div>
        </div>
        {balance.data && balance.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Currency</th>
                <th className="py-1 text-right">Charges</th>
                <th className="py-1 text-right">Receipts</th>
                <th className="py-1 text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {balance.data.map((b) => (
                <tr key={b.currencyCode} className="border-t">
                  <td className="py-1 font-medium">{b.currencyCode}</td>
                  <td className="py-1 text-right">{money(b.totalCharges)}</td>
                  <td className="py-1 text-right">{money(b.totalReceipts)}</td>
                  <td className="py-1 text-right font-semibold">{money(b.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No charges or payments recorded.</p>
        )}
      </Card>
    </div>
  );
}
