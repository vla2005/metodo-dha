import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  const config = app.get(ConfigService);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_ORIGINS').split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  });
  const prefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(prefix);
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Método DHA API').setVersion('0.1').addCookieAuth(config.get<string>('PUBLIC_SESSION_COOKIE_NAME', 'dha_session')).build());
  SwaggerModule.setup(`${prefix}/docs`, app, document);
  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();
