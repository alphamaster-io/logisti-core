import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';
/**
 * Mark an endpoint as exempt from automatic audit-log recording.
 * Use sparingly. Provide a reason string for the next reader.
 */
export const SkipAudit = (reason: string) => SetMetadata(SKIP_AUDIT_KEY, reason);
