'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ALL_ROLES,
  updateUserSchema,
  type UpdateUserDto,
  type UserResponse,
} from '@logisti-core/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

interface EditUserDialogProps {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<UpdateUserDto>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: user?.name ?? '', roles: (user?.roles ?? []) as never },
  });

  React.useEffect(() => {
    if (user) {
      form.reset({ name: user.name, roles: user.roles as never });
    }
  }, [user, form]);

  const mutation = useMutation({
    mutationFn: async (values: UpdateUserDto) => {
      if (!user) throw new Error('No user');
      return api.patch<UserResponse>(`/api/proxy/users/${user.id}`, values);
    },
    onSuccess: () => {
      toast.success('User updated');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to update user';
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update name and assigned roles.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map((role) => {
                      const checked = field.value?.includes(role) ?? false;
                      return (
                        <label
                          key={role}
                          className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              const set = new Set(field.value ?? []);
                              if (c) set.add(role);
                              else set.delete(role);
                              field.onChange(Array.from(set));
                            }}
                          />
                          {role}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
