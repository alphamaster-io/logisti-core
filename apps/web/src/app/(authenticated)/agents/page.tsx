'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { api, ApiError, newIdempotencyKey } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';

type Agent = {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
  commissionPercent: string | null;
  commissionPerBoxMinor: string | null;
  commissionCurrency: string | null;
  isActive: boolean;
};

function money(minor: string | null): string {
  if (minor == null) return '—';
  const n = BigInt(minor);
  const major = n / 100n;
  const cents = (n % 100n).toString().padStart(2, '0');
  return `${major}.${cents}`;
}

function CreateAgentDialog() {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/api/proxy/agents', payload),
    onSuccess: () => {
      toast.success('Agent created');
      qc.invalidateQueries({ queryKey: ['agents'] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      code: String(fd.get('code') ?? '').toUpperCase(),
      name: fd.get('name'),
    };
    const pct = fd.get('pct');
    const perBox = fd.get('perBox');
    const currency = String(fd.get('currency') ?? '').toUpperCase();
    if (pct && currency) {
      payload.commissionPercent = Number(pct);
      payload.commissionCurrency = currency;
    } else if (perBox && currency) {
      // major → minor
      const major = Number(perBox);
      payload.commissionPerBoxMinor = Math.round(major * 100);
      payload.commissionCurrency = currency;
    }
    create.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Partner outlet that intakes on our behalf. Set exactly one commission rate.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input name="code" placeholder="AG-CW-001" required />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input name="name" placeholder="Causeway Bay Agent" required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>% commission</Label>
              <Input name="pct" inputMode="decimal" placeholder="5" />
            </div>
            <div className="space-y-1">
              <Label>Or per-box</Label>
              <Input name="perBox" inputMode="decimal" placeholder="10.00" />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Input name="currency" placeholder="HKD" maxLength={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/api/proxy/agents'),
    retry: false,
  });

  const columns: DataTableColumn<Agent>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (a) => (
        <Link href={`/agents/${a.id}`} className="font-mono font-medium hover:underline">
          {a.code}
        </Link>
      ),
    },
    { key: 'name', header: 'Name', cell: (a) => a.name },
    {
      key: 'commission',
      header: 'Commission',
      cell: (a) => {
        if (a.commissionPercent != null) return `${a.commissionPercent}% ${a.commissionCurrency}`;
        if (a.commissionPerBoxMinor != null)
          return `${a.commissionCurrency} ${money(a.commissionPerBoxMinor)} / box`;
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) =>
        a.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
  ];

  // Throw away — keeps the import non-orphan even though we don't use idempotency
  // on agent CRUD itself (only batch issuance). Future commission line entry
  // will need it.
  void newIdempotencyKey;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Partner outlets — pre-printed box-number batches, commission accounting.
          </p>
        </div>
        <CreateAgentDialog />
      </div>
      <DataTable
        columns={columns}
        rows={agents.data ?? []}
        rowKey={(a) => a.id}
        loading={agents.isPending}
        emptyMessage="No agents yet"
        hasMore={false}
      />
    </div>
  );
}
