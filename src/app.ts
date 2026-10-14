import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { createDirectusClient } from './lib/directus.js';
import { AuthService } from './services/auth.service.js';

export const buildApp = () => {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' });

  app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  app.register(fastifyCookie, {
    secret: process.env.SESSION_SECRET || 'fallback-secret-for-tests-only-32c',
  });

  const directus = createDirectusClient();
  const authService = new AuthService(directus);

  app.get('/healthz', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.post('/api/v1/auth/register', async (request, reply) => {
    try {
      const user = await authService.register(request.body as any);
      return reply.status(201).send({ success: true, data: user });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message || err });
    }
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    try {
      const result = await authService.login(request.body as any);

      if (result.refresh_token) {
        reply.setCookie('directus_refresh_token', result.refresh_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });
      }

      return reply.send({
        success: true,
        access_token: result.access_token,
        expires: result.expires,
      });
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials or login failed' });
    }
  });

  app.post('/api/v1/auth/logout', async (_request, reply) => {
    try {
      await authService.logout();
    } catch {}
    reply.clearCookie('directus_refresh_token', { path: '/' });
    return reply.send({ success: true, message: 'Logged out' });
  });

  return app;
};
