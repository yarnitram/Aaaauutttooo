import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';

export async function dataRoutes(server: FastifyInstance, opts: { authService?: AuthService } = {}) {
  const authService = opts.authService || new AuthService();

  const extractBearerToken = (req: FastifyRequest, reply: FastifyReply): string | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing Authorization Bearer header',
      });
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Malformed Bearer token authorization header',
      });
      return null;
    }

    return parts[1];
  };

  // Read Collection (Stateless without cookies)
  server.get<{ Params: { collection: string }; Querystring: Record<string, any> }>('/api/data/:collection', {
    schema: {
      description: 'Stateless Directus collection read using Bearer token without cookies',
      tags: ['Data & Collections'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['collection'],
        properties: {
          collection: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { collection: string }; Querystring: Record<string, any> }>, reply: FastifyReply) => {
    const token = extractBearerToken(req, reply);
    if (!token) return;

    try {
      const { collection } = req.params;
      const data = await authService.getCollectionData(token, collection, req.query);
      return reply.status(200).send({
        success: true,
        collection,
        data,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err?.message || 'Unauthorized: Unable to read collection',
      });
    }
  });

  // Write / Create Item in Collection (Stateless without cookies)
  server.post<{ Params: { collection: string }; Body: Record<string, any> }>('/api/data/:collection', {
    schema: {
      description: 'Stateless Directus collection item creation using Bearer token without cookies',
      tags: ['Data & Collections'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['collection'],
        properties: {
          collection: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { collection: string }; Body: Record<string, any> }>, reply: FastifyReply) => {
    const token = extractBearerToken(req, reply);
    if (!token) return;

    try {
      const { collection } = req.params;
      const created = await authService.createCollectionData(token, collection, req.body || {});
      return reply.status(201).send({
        success: true,
        collection,
        data: created,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err?.message || 'Unauthorized: Unable to create collection item',
      });
    }
  });
}
