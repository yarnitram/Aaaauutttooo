import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';

export async function userRoutes(server: FastifyInstance, opts: { authService?: AuthService } = {}) {
  const authService = opts.authService || new AuthService();

  server.get('/api/user/profile', {
    schema: {
      description: 'Get authenticated user profile (Auth Guard)',
      tags: ['User'],
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      response: {
        401: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. Check HttpOnly cookie
    let token = req.cookies?.session_token;

    // 2. Check Authorization Bearer header fallback
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }

    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: No session cookie or token provided',
      });
    }

    try {
      const profile = await authService.getUserProfile(token);
      return reply.status(200).send(profile);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: Invalid or expired session token',
      });
    }
  });
}
