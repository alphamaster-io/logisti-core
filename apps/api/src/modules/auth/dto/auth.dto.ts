import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alphabyte.master@logisti-core.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'AlphabyteMaster!2026' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class SwitchRoleDto {
  @ApiProperty({
    description: 'Role key to act as. Send null to revert to full access (master only).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  roleKey!: string | null;
}

export class SwitchBranchDto {
  @ApiProperty({ description: 'Target branch id. Send null to revert.', nullable: true })
  @IsOptional()
  @IsString()
  branchId!: string | null;
}
