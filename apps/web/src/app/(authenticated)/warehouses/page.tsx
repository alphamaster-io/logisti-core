'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Branch {
  id: string;
  name: string;
}
interface Warehouse {
  id: string;
  name: string;
  branchId: string;
}
interface Zone {
  id: string;
  name: string;
}
interface Rack {
  id: string;
  name: string;
}
interface Bin {
  id: string;
  name: string;
}

function unwrap<T>(res: { data: T[] } | T[] | undefined | null): T[] {
  if (!res) return [];
  return Array.isArray(res) ? res : (res.data ?? []);
}

function ZoneTree({ zoneId }: { zoneId: string }) {
  const racksQuery = useQuery({
    queryKey: ['racks', zoneId],
    queryFn: () => api.get<{ data: Rack[] } | Rack[]>(`/api/proxy/zones/${zoneId}/racks`),
    retry: false,
  });
  const racks = unwrap(racksQuery.data);
  if (racksQuery.isPending) return <Skeleton className="h-6 w-32" />;
  if (racks.length === 0) return <p className="text-sm text-muted-foreground">No racks</p>;
  return (
    <Accordion type="multiple" className="ml-4">
      {racks.map((r) => (
        <AccordionItem value={r.id} key={r.id}>
          <AccordionTrigger>{r.name}</AccordionTrigger>
          <AccordionContent>
            <RackTree rackId={r.id} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function RackTree({ rackId }: { rackId: string }) {
  const binsQuery = useQuery({
    queryKey: ['bins', rackId],
    queryFn: () => api.get<{ data: Bin[] } | Bin[]>(`/api/proxy/racks/${rackId}/bins`),
    retry: false,
  });
  const bins = unwrap(binsQuery.data);
  if (binsQuery.isPending) return <Skeleton className="h-6 w-32" />;
  if (bins.length === 0) return <p className="text-sm text-muted-foreground">No bins</p>;
  return (
    <ul className="ml-4 list-disc text-sm">
      {bins.map((b) => (
        <li key={b.id}>{b.name}</li>
      ))}
    </ul>
  );
}

function WarehouseTree({ warehouseId }: { warehouseId: string }) {
  const zonesQuery = useQuery({
    queryKey: ['zones', warehouseId],
    queryFn: () => api.get<{ data: Zone[] } | Zone[]>(`/api/proxy/warehouses/${warehouseId}/zones`),
    retry: false,
  });
  const zones = unwrap(zonesQuery.data);
  if (zonesQuery.isPending) return <Skeleton className="h-6 w-32" />;
  if (zones.length === 0) return <p className="text-sm text-muted-foreground">No zones</p>;
  return (
    <Accordion type="multiple" className="ml-4">
      {zones.map((z) => (
        <AccordionItem value={z.id} key={z.id}>
          <AccordionTrigger>{z.name}</AccordionTrigger>
          <AccordionContent>
            <ZoneTree zoneId={z.id} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function BranchTree({ branchId }: { branchId: string }) {
  const whQuery = useQuery({
    queryKey: ['warehouses', branchId],
    queryFn: () =>
      api.get<{ data: Warehouse[] } | Warehouse[]>(`/api/proxy/warehouses?branchId=${branchId}`),
    retry: false,
  });
  const warehouses = unwrap(whQuery.data);
  if (whQuery.isPending) return <Skeleton className="h-6 w-32" />;
  if (warehouses.length === 0)
    return <p className="text-sm text-muted-foreground">No warehouses</p>;
  return (
    <Accordion type="multiple" className="ml-4">
      {warehouses.map((w) => (
        <AccordionItem value={w.id} key={w.id}>
          <AccordionTrigger>{w.name}</AccordionTrigger>
          <AccordionContent>
            <WarehouseTree warehouseId={w.id} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export default function WarehousesPage() {
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<{ data: Branch[] } | Branch[]>('/api/proxy/branches'),
    retry: false,
  });
  const branches = unwrap(branchesQuery.data);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Warehouses</h1>
        <p className="text-sm text-muted-foreground">
          Browse the branch → warehouse → zone → rack → bin hierarchy.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
        </CardHeader>
        <CardContent>
          {branchesQuery.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branches yet.</p>
          ) : (
            <Accordion type="multiple">
              {branches.map((b) => (
                <AccordionItem value={b.id} key={b.id}>
                  <AccordionTrigger>{b.name}</AccordionTrigger>
                  <AccordionContent>
                    <BranchTree branchId={b.id} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
