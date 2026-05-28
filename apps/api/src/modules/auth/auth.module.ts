import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { LockoutService } from './lockout.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        secret: cfg.jwtAccessSecret,
        signOptions: { expiresIn: cfg.jwtAccessTtl },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, LockoutService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
