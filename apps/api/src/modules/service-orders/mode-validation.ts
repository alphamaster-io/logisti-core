import { BadRequestException } from '@nestjs/common';
import type { ServiceMode } from '@prisma/client';
import type { CreateServiceOrderDto } from '@logisti-core/shared';

// Mode-driven required fields per
// openspec/changes/align-with-exspeed-workflows/specs/receiving/spec.md.
// Called by the controller before any DB write.

export function validateModeRequiredFields(dto: CreateServiceOrderDto): void {
  const issues: string[] = [];

  switch (dto.mode satisfies ServiceMode) {
    case 'DELIVER_BOX':
      if (!dto.pickupAddress || Object.keys(dto.pickupAddress).length === 0) {
        issues.push('pickupAddress required for deliver_box mode');
      }
      if (!dto.scheduledPickupAt) {
        issues.push('scheduledPickupAt required for deliver_box mode');
      }
      break;
    case 'PICK_UP_BOX':
    case 'INSTANT_PACK':
    case 'STORAGE':
      // branchId is already required by the base schema; nothing additional here.
      break;
    case 'AGENT_INTAKE':
      // agent_intake routes through agents capability — not in this slice.
      issues.push('agent_intake mode is not implemented yet (agents capability pending)');
      break;
    case 'MACAU_INTAKE':
      // macau_intake routes through manifests capability — not in this slice.
      issues.push('macau_intake mode is not implemented yet (manifests capability pending)');
      break;
  }

  if (issues.length > 0) {
    throw new BadRequestException({ message: issues, mode: dto.mode });
  }
}
