'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type BranchOption = { id: string; code: string; name: string };

const MODES = ['DELIVER_BOX', 'PICK_UP_BOX', 'INSTANT_PACK', 'STORAGE'] as const;

export function CreateOrderDialog() {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<string>('PICK_UP_BOX');
  const [branchId, setBranchId] = React.useState<string>('');
  const router = useRouter();
  const queryClient = useQueryClient();

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchOption[]>('/api/proxy/branches'),
    enabled: open,
    retry: false,
  });

  const form = React.useRef<HTMLFormElement>(null);

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/api/proxy/service-orders', payload),
    onSuccess: (order) => {
      toast.success('Order created');
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      setOpen(false);
      router.push(`/orders/${order.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Create failed'),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!branchId) {
      toast.error('Select a branch');
      return;
    }
    const payload: Record<string, unknown> = {
      mode,
      branchId,
      customerSnapshot: {
        surname: fd.get('cSurname'),
        givenName: fd.get('cGiven'),
        contactNumbers: [String(fd.get('cContact') ?? '')].filter(Boolean),
      },
      consigneeSnapshot: {
        surname: fd.get('rSurname'),
        givenName: fd.get('rGiven'),
        contactNumbers: [String(fd.get('rContact') ?? '')].filter(Boolean),
        address: {
          city: fd.get('rCity'),
          province: fd.get('rProvince'),
          street: fd.get('rStreet'),
        },
      },
    };
    if (mode === 'DELIVER_BOX') {
      payload.pickupAddress = {
        building: fd.get('pickupAddr'),
        district: fd.get('pickupDistrict'),
      };
      const when = fd.get('scheduledPickupAt');
      if (when) payload.scheduledPickupAt = new Date(String(when)).toISOString();
    }
    create.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New order</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New service order</DialogTitle>
          <DialogDescription>Capture the customer, consignee, and intake mode.</DialogDescription>
        </DialogHeader>
        <form ref={form} onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger aria-label="Intake mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Customer (sender)</legend>
            <div className="grid grid-cols-2 gap-2">
              <Input name="cSurname" placeholder="Surname" required />
              <Input name="cGiven" placeholder="Given name" required />
            </div>
            <Input name="cContact" placeholder="Contact number" required />
          </fieldset>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Consignee (receiver, PH)</legend>
            <div className="grid grid-cols-2 gap-2">
              <Input name="rSurname" placeholder="Surname" required />
              <Input name="rGiven" placeholder="Given name" required />
            </div>
            <Input name="rContact" placeholder="Contact number" required />
            <div className="grid grid-cols-3 gap-2">
              <Input name="rStreet" placeholder="Street" />
              <Input name="rCity" placeholder="City" />
              <Input name="rProvince" placeholder="Province" />
            </div>
          </fieldset>

          {mode === 'DELIVER_BOX' && (
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Pickup (HK)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input name="pickupAddr" placeholder="Building" />
                <Input name="pickupDistrict" placeholder="District" />
              </div>
              <Input name="scheduledPickupAt" type="datetime-local" aria-label="Scheduled pickup" />
            </fieldset>
          )}

          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
