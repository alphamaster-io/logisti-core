'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PaginatedResponse } from '@logisti-core/shared';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatDate, truncate } from '@/lib/utils';

interface AuditLog {
  id: string;
  createdAt: string;
  actorName?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
}

export default function AuditPage() {
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = React.useState<AuditLog[]>([]);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  const params = new URLSearchParams();
  params.set('limit', '25');
  if (cursor) params.set('cursor', cursor);

  const query = useQuery({
    queryKey: ['audit', cursor ?? ''],
    queryFn: () => api.get<PaginatedResponse<AuditLog>>(`/api/proxy/audit-logs?${params.toString()}`),
    refetchInterval: autoRefresh ? 30_000 : false,
    retry: false,
  });

  React.useEffect(() => {
    if (!query.data) return;
    setAccumulated((prev) => {
      const merged = cursor ? [...prev, ...query.data.data] : query.data.data;
      const seen = new Set<string>();
      return merged.filter((l) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
    });
  }, [query.data, cursor]);

  const columns: DataTableColumn<AuditLog>[] = [
    { key: 'when', header: 'When', cell: (r) => formatDate(r.createdAt) },
    { key: 'who', header: 'Who', cell: (r) => r.actorName ?? r.actorId ?? 'system' },
    {
      key: 'action',
      header: 'Action',
      cell: (r) => <span className="font-mono text-xs">{r.action}</span>,
    },
    { key: 'entityType', header: 'Entity type', cell: (r) => r.entityType },
    {
      key: 'entityId',
      header: 'Entity ID',
      cell: (r) => (r.entityId ? <span className="font-mono text-xs">{truncate(r.entityId, 14)}</span> : '—'),
    },
    {
      key: 'requestId',
      header: 'Request ID',
      cell: (r) =>
        r.requestId ? <span className="font-mono text-xs">{truncate(r.requestId, 14)}</span> : '—',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Tenant activity timeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <Label htmlFor="auto-refresh">Auto refresh (30s)</Label>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={accumulated}
        rowKey={(r) => r.id}
        loading={query.isPending && accumulated.length === 0}
        emptyMessage="No audit events"
        hasMore={!!query.data?.hasMore}
        loadingMore={query.isFetching && !!cursor}
        onLoadMore={() => {
          if (query.data?.nextCursor) setCursor(query.data.nextCursor);
        }}
      />
    </div>
  );
}
