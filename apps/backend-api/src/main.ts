import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const defaultOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:4203',
    'http://127.0.0.1:4203',
    'capacitor://localhost',
    'http://localhost',
  ];
  const configuredOrigins = process.env.API_CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production' && !configuredOrigins?.length) {
    throw new Error('API_CORS_ORIGINS must be configured in production.');
  }

  app.use(helmet());
  app.enableCors({
    origin: configuredOrigins?.length ? configuredOrigins : defaultOrigins,
    credentials: true,
  });

  const trustProxyHops = process.env.TRUST_PROXY_HOPS;
  if (trustProxyHops && /^\d+$/.test(trustProxyHops)) {
    app.getHttpAdapter().getInstance().set('trust proxy', Number(trustProxyHops));
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SMARTROUTE AI API')
    .setDescription('Malaysia smart mobility, road safety, fleet, and delivery orchestration API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
