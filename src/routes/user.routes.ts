import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';

function extractToken(req: FastifyRequest): string | undefined {
  let token = req.cookies?.session_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      token = parts[1];
    }
  }
  return token;
}

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
    const token = extractToken(req);

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

  server.patch<{ Body: { newPassword: string } }>('/api/user/password', {
    schema: {
      description: 'Update current user password (Auth Guard)',
      tags: ['User'],
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: {
          newPassword: { type: 'string', minLength: 8, description: 'New password (minimum 8 characters)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
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
  }, async (req: FastifyRequest<{ Body: { newPassword: string } }>, reply: FastifyReply) => {
    const token = extractToken(req);

    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: No session cookie or token provided',
      });
    }

    try {
      const { newPassword } = req.body;
      const result = await authService.updateUserPassword(token, newPassword);
      return reply.status(200).send(result);
    } catch (err: any) {
      req.log.error(err, 'Failed to update user password');
      const isValidationError = /at least 8 characters/i.test(err?.message || '');
      return reply.status(isValidationError ? 400 : 401).send({
        statusCode: isValidationError ? 400 : 401,
        error: isValidationError ? 'Bad Request' : 'Unauthorized',
        message: err.message || 'Failed to update password',
      });
    }
  });

  server.patch<{ Body: { firstName?: string; lastName?: string } }>('/api/user/profile', {
    schema: {
      description: 'Update authenticated user profile information',
      tags: ['User'],
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
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
  }, async (req: FastifyRequest<{ Body: { firstName?: string; lastName?: string } }>, reply: FastifyReply) => {
    const token = extractToken(req);

    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: No session cookie or token provided',
      });
    }

    try {
      const updated = await authService.updateUserProfile(token, req.body);
      return reply.status(200).send(updated);
    } catch (err: any) {
      req.log.error(err, 'Failed to update profile');
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: Invalid or expired session token',
      });
    }
  });
}

