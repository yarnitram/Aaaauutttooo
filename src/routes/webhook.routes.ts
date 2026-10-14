import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';

export async function webhookRoutes(server: FastifyInstance, opts: { authService?: AuthService } = {}) {
  const authService = opts.authService || new AuthService();

  const verifyServiceBearer = async (req: FastifyRequest, reply: FastifyReply): Promise<any> => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing Authorization Bearer header',
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Malformed Bearer token authorization header',
      });
    }

    try {
      return await authService.validateServiceToken(parts[1]);
    } catch {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired Bearer token',
      });
    }
  };

  // Generic Webhook Receiver
  server.post('/api/webhooks/receiver', {
    schema: {
      description: 'Authenticated Webhook Receiver for Homelab Automation',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const serviceUser = await verifyServiceBearer(req, reply);
    if (!serviceUser) return;

    const eventId = crypto.randomUUID();
    const payload = req.body || {};

    req.log.info({ eventId, serviceUser: serviceUser.email }, 'Received authenticated webhook event');

    return reply.status(200).send({
      success: true,
      eventId,
      receivedAt: new Date().toISOString(),
      source: 'generic',
      handledBy: serviceUser.email,
      payload,
    });
  });

  // Dedicated Hermes AI Webhook Receiver
  server.post('/api/webhooks/hermes', {
    schema: {
      description: 'Dedicated Webhook Receiver for Hermes AI Agent (192.168.2.7)',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const serviceUser = await verifyServiceBearer(req, reply);
    if (!serviceUser) return;

    const eventId = crypto.randomUUID();
    const payload = req.body || {};

    req.log.info({ eventId, serviceUser: serviceUser.email }, 'Received Hermes AI webhook event');

    return reply.status(200).send({
      success: true,
      eventId,
      receivedAt: new Date().toISOString(),
      source: 'hermes',
      handledBy: serviceUser.email,
      payload,
    });
  });

  // Dedicated n8n Automation Webhook Receiver
  server.post('/api/webhooks/n8n', {
    schema: {
      description: 'Dedicated Webhook Receiver for n8n Automation (192.168.2.6)',
      tags: ['Webhooks'],
      security: [{ bearerAuth: [] }],
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const serviceUser = await verifyServiceBearer(req, reply);
    if (!serviceUser) return;

    const eventId = crypto.randomUUID();
    const payload = req.body || {};

    req.log.info({ eventId, serviceUser: serviceUser.email }, 'Received n8n webhook event');

    return reply.status(200).send({
      success: true,
      eventId,
      receivedAt: new Date().toISOString(),
      source: 'n8n',
      handledBy: serviceUser.email,
      payload,
    });
  });
}
