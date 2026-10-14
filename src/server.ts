import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './config/env.js';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { AuthService } from './services/auth.service.js';

export interface ServerOptions {
  authService?: AuthService;
  logger?: boolean | object;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const server = Fastify({
    logger: options.logger ?? (config.nodeEnv === 'development' ? {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    } : false),
  });

  // Register cookie parser
  await server.register(fastifyCookie, {
    secret: config.cookieSecret,
    hook: 'onRequest',
  });

  // Register CORS
  await server.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  // Register Swagger documentation
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Aaaauutttooo AuthApp API',
        description: 'Directus-powered Authentication Gateway & BFF API',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'https://auth.ymatt.online',
          description: 'Production Cloudflare Tunnel',
        },
        {
          url: `http://localhost:${config.port}`,
          description: 'Local Development Server',
        },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'session_token',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Register route groups
  await server.register(healthRoutes);
  await server.register(authRoutes, { authService: options.authService });
  await server.register(userRoutes, { authService: options.authService });

  return server;
}

export async function createTestServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const server = await buildServer({
    logger: false,
    ...options,
  });
  await server.ready();
  return server;
}
