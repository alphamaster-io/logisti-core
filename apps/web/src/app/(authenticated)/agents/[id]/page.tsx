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
import { formatDate } from '@/lib/utils';

type Agent = {
  id: string;
  code: string;
  name: string;
  commissionPercent: string | null;
  commissionPerBoxMinor: string | null;
  commissionCurrency: string | null;
  isActive: boolean;
  createdAt: string;
};
type Batch = {
  id: string;
  prefix: string;
  startSeq: number;
  endSeq: number;
  nextSeq: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'VOIDED';
  notes: string | null;
  issuedAt: string;
};

function IssueBatchDialog({ agentId }: { agentId: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const issue = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/api/proxy/agents/${agentId}/batches`, payload, {
        'Idempotency-Key': newIdempotencyKey(),
      }),
    onSuccess: () => {
      toast.success('Batch issued');
      qc.invalidateQueries({ queryKey: ['agent-batches', agentId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    issue.mutate({
      prefix: String(fd.get('prefix') ?? '').toUpperCase(),
      startSeq: Number(fd.get('startSeq')),
      count: Number(fd.get('count')),
      notes: String(fd.get('notes') ?? '') || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Issue batch</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue box-number batch</DialogTitle>
          <DialogDescription>
            Box numbers = prefix + 6-digit sequence (e.g. EX-AG-001-000042).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Prefix</Label>
            <Input name="prefix" placeholder="EX-AG-001-" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Start seq</Label>
              <Input name="startSeq" type="number" min={1} defaultValue={1} required />
            </div>
            <div className="space-y-1">
              <Label>Count</Label>
              <Input name="count" type="number" min={1} max={100000} defaultValue={100} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input name="notes" placeholder="optional" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={issue.isPending}>
              {issue.isPending ? 'Issuing…' : 'Issue batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const agent = useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.get<Agent>(`/api/proxy/agents/${id}`),
    retry: false,
  });
  const batches = useQuery({
    queryKey: ['agent-batches', id],
    queryFn: () => api.get<Batch[]>(`/api/proxy/agents/${id}/batches`),
    retry: false,
  });

  const allocate = useMutation({
    mutationFn: (batchId: string) =>
      api.post<{ number: string }>(
        `/api/proxy/agents/batches/${batchId}/allocate-next`,
        undefined,
        { 'Idempotency-Key': newIdempotencyKey() },
      ),
    onSuccess: (out) => {
      toast.success(`Allocated ${out.number}`);
      qc.invalidateQueries({ queryKey: ['agent-batches', id] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const voidBatch = useMutation({
    mutationFn: (batchId: string) =>
      api.post(`/api/proxy/agents/batches/${batchId}/void`, undefined),
    onSuccess: () => {
      toast.success('Batch voided');
      qc.invalidateQueries({ queryKey: ['agent-batches', id] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (agent.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (agent.isError || !agent.data) return <p className="text-destructive">Agent not found.</p>;

  const a = agent.data;
  const commission =
    a.commissionPercent != null
      ? `${a.commissionPercent}% ${a.commissionCurrency}`
      : a.commissionPerBoxMinor != null
        ? `${a.commissionCurrency} ${a.commissionPerBoxMinor}/box (minor)`
        : '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{a.code}</h1>
          <p className="text-sm text-muted-foreground">{a.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {a.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}
            <Badge variant="outline">Commission: {commission}</Badge>
            <span className="text-sm text-muted-foreground">{formatDate(a.createdAt)}</span>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Box-number batches ({batches.data?.length ?? 0})</h2>
          <IssueBatchDialog agentId={id} />
        </div>
        {batches.data && batches.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Prefix</th>
                <th className="py-1">Range</th>
                <th className="py-1">Used</th>
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => {
                const used = b.nextSeq - b.startSeq;
                const total = b.endSeq - b.startSeq + 1;
                return (
                  <tr key={b.id} className="border-t">
                    <td className="py-1 font-mono">{b.prefix}</td>
                    <td className="py-1">
                      {b.startSeq}–{b.endSeq}
                    </td>
                    <td className="py-1 text-muted-foreground">
                      {used} / {total}
                    </td>
                    <td className="py-1">
                      <Badge variant={b.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {b.status}
                      </Badge>
                    </td>
                    <td className="py-1 text-right">
                      {b.status === 'ACTIVE' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => allocate.mutate(b.id)}
                            disabled={allocate.isPending}
                            className="mr-2"
                          >
                            Allocate next
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm('Void this batch? Used numbers remain valid.')) {
                                voidBatch.mutate(b.id);
                              }
                            }}
                          >
                            Void
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No batches yet.</p>
        )}
      </Card>
    </div>
  );
}
