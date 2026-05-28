import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix(config.globalPrefix, {
    exclude: [{ path: 'health', method: 0 }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LogistiCore API')
    .setDescription('Warehouse & Cargo Management Platform — Phase 1')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${config.globalPrefix}/docs`, app, document);

  await app.listen(config.port, '0.0.0.0');
  app
    .get(Logger)
    .log(
      `LogistiCore API listening on http://0.0.0.0:${config.port}/${config.globalPrefix} (docs: /${config.globalPrefix}/docs)`,
    );
}

bootstrap();
