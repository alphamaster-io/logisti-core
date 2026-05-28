import { z } from 'zod';

export const cuidSchema = z.string().cuid2().or(z.string().cuid()).or(z.string().uuid());

export const isoDateSchema = z.string().datetime({ offset: true });

export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.record(z.array(z.string())).optional(),
  requestId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
