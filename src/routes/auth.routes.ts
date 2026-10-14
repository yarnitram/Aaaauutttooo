import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config/env.js';

interface RegisterBody {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface LoginBody {
  email: string;
  password: string;
  otp?: string;
}

interface RefreshBody {
  refresh_token?: string;
}

export async function authRoutes(server: FastifyInstance, opts: { authService?: AuthService } = {}) {
  const authService = opts.authService || new AuthService();

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax' as const,
    domain: config.cookieDomain,
  };

  // Register
  server.post<{ Body: RegisterBody }>('/api/auth/register', {
    schema: {
      description: 'Register a new user account in Directus',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const user = await authService.register(req.body);
      return reply.status(201).send({
        success: true,
        message: 'Registration successful',
        user,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err?.message || 'Registration failed',
      });
    }
  });

  // Login
  server.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      description: 'Log in with email and password via Directus',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          otp: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { email, password, otp } = req.body;
      const result = await authService.login(email, password, otp);

      if (result.requires2FA) {
        return reply.status(200).send({
          requires2FA: true,
          message: 'Two-factor authentication code required',
        });
      }

      if (result.access_token) {
        reply.setCookie('session_token', result.access_token, {
          ...cookieOptions,
          maxAge: Math.floor((result.expires || 900000) / 1000),
        });
      }

      if (result.refresh_token) {
        reply.setCookie('refresh_token', result.refresh_token, {
          ...cookieOptions,
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }

      return reply.status(200).send({
        success: true,
        access_token: result.access_token,
        expires: result.expires,
        requires2FA: false,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err?.message || 'Invalid email or password',
      });
    }
  });

  // Refresh Session
  server.post<{ Body: RefreshBody }>('/api/auth/refresh', {
    schema: {
      description: 'Refresh access token using HttpOnly refresh cookie or payload',
      tags: ['Authentication'],
    },
  }, async (req, reply) => {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body?.refresh_token;

      if (!refreshToken) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing refresh token',
        });
      }

      const result = await authService.refresh(refreshToken);

      if (result.access_token) {
        reply.setCookie('session_token', result.access_token, {
          ...cookieOptions,
          maxAge: Math.floor((result.expires || 900000) / 1000),
        });
      }

      if (result.refresh_token) {
        reply.setCookie('refresh_token', result.refresh_token, {
          ...cookieOptions,
          maxAge: 60 * 60 * 24 * 7,
        });
      }

      return reply.status(200).send({
        success: true,
        access_token: result.access_token,
        expires: result.expires,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err?.message || 'Failed to refresh token',
      });
    }
  });

  // Logout
  server.post('/api/auth/logout', {
    schema: {
      description: 'Log out and invalidate session cookies',
      tags: ['Authentication'],
    },
  }, async (req, reply) => {
    const refreshToken = req.cookies?.refresh_token;

    try {
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch (err) {
      req.log.warn(err, 'Directus logout call encountered non-fatal error');
    }

    reply.clearCookie('session_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  });
}
