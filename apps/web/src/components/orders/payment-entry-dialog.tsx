'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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

// Kinds the operator can record by hand. Loyalty / agent commission are
// emitted by their respective capabilities (not yet built).
const CHARGE_KINDS = [
  'BOX_BALANCE',
  'OVERSIZE_SURCHARGE',
  'STORAGE_DEPOSIT',
  'STORAGE_PICKUP_FEE',
  'INSTANT_PACK_DISCOUNT',
  'TAKE_OUT_BOX_DISCOUNT',
] as const;

const CURRENCIES = ['HKD', 'PHP', 'MOP'];

type Mode = 'charge' | 'payment';

function parseMajorToMinor(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  const neg = v.startsWith('-');
  const abs = neg ? v.slice(1) : v;
  const [whole, frac = ''] = abs.split('.');
  const cents = (frac + '00').slice(0, 2);
  return `${neg ? '-' : ''}${BigInt((whole ?? '0') + cents)}`;
}

export function PaymentEntryDialog({
  orderId,
  mode,
  trigger,
}: {
  orderId: string;
  mode: Mode;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState('HKD');
  const [kind, setKind] = React.useState<string>('BOX_BALANCE');
  const [reason, setReason] = React.useState('');
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: async () => {
      const amountMinor = parseMajorToMinor(amount);
      if (!amountMinor || amountMinor === '0') {
        throw new Error('Enter a non-zero amount with at most 2 decimal places');
      }
      const path =
        mode === 'charge'
          ? `/api/proxy/service-orders/${orderId}/charges`
          : `/api/proxy/service-orders/${orderId}/payments`;
      const body: Record<string, unknown> = {
        amountMinor,
        currencyCode: currency,
        reason: reason.trim() || (mode === 'charge' ? kind.toLowerCase() : 'payment received'),
      };
      if (mode === 'charge') body.kind = kind;
      return api.post(path, body);
    },
    onSuccess: () => {
      toast.success(mode === 'charge' ? 'Charge recorded' : 'Payment recorded');
      qc.invalidateQueries({ queryKey: ['order-balance', orderId] });
      qc.invalidateQueries({ queryKey: ['order-lines', orderId] });
      setOpen(false);
      setAmount('');
      setReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'charge' ? 'Record charge' : 'Record payment'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          {mode === 'charge' && (
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger aria-label="Charge kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARGE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                placeholder="e.g. 1035.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Input
              placeholder={mode === 'charge' ? 'e.g. king balance' : 'e.g. cash'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending
                ? 'Saving…'
                : mode === 'charge'
                  ? 'Record charge'
                  : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Exported for unit testing.
export { parseMajorToMinor };
