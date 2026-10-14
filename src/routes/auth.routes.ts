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

interface Enable2FABody {
  secret: string;
  otp: string;
}

interface Disable2FABody {
  otp: string;
}

interface Verify2FAChallengeBody {
  email: string;
  password: string;
  otp: string;
  challengeToken?: string;
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

  const extractToken = (req: FastifyRequest): string | undefined => {
    if (req.cookies?.session_token) return req.cookies.session_token;
    if (req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        return parts[1];
      }
    }
    return undefined;
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
      description: 'Log in with email and password (and optional 2FA OTP) via Directus',
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
          challengeToken: result.challengeToken,
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
      const isValidationError = /invalid email format|invalid otp format/i.test(err?.message || '');
      return reply.status(isValidationError ? 400 : 401).send({
        statusCode: isValidationError ? 400 : 401,
        error: isValidationError ? 'Bad Request' : 'Unauthorized',
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

  // Phase 2: 2FA Setup - Generate Secret & QR Code
  server.post('/api/auth/2fa/generate', {
    schema: {
      description: 'Generate TOTP 2FA secret and QR code for authenticated user',
      tags: ['Authentication - 2FA'],
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const token = extractToken(req);
    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: Session required to configure 2FA',
      });
    }

    try {
      const result = await authService.generate2FA(token);
      return reply.status(200).send({
        success: true,
        secret: result.secret,
        otpauth_url: result.otpauth_url,
        qr_code: result.qr_code,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err?.message || 'Failed to generate 2FA secret',
      });
    }
  });

  // Phase 2: 2FA Verification & Enablement
  server.post<{ Body: Enable2FABody }>('/api/auth/2fa/enable', {
    schema: {
      description: 'Confirm TOTP code and finalize 2FA enablement',
      tags: ['Authentication - 2FA'],
      body: {
        type: 'object',
        required: ['secret', 'otp'],
        properties: {
          secret: { type: 'string' },
          otp: { type: 'string', pattern: '^[0-9]{6}$' },
        },
      },
    },
  }, async (req, reply) => {
    const token = extractToken(req);
    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: Session required to enable 2FA',
      });
    }

    try {
      const { secret, otp } = req.body;
      const res = await authService.enable2FA(token, secret, otp);
      return reply.status(200).send(res);
    } catch (err: any) {
      req.log.error(err);
      const isValidationError = /invalid otp format/i.test(err?.message || '');
      return reply.status(isValidationError ? 400 : 401).send({
        statusCode: isValidationError ? 400 : 401,
        error: isValidationError ? 'Bad Request' : 'Unauthorized',
        message: err?.message || 'Failed to enable 2FA',
      });
    }
  });

  // Phase 2: 2FA Disable
  server.post<{ Body: Disable2FABody }>('/api/auth/2fa/disable', {
    schema: {
      description: 'Disable 2FA by verifying the current TOTP code',
      tags: ['Authentication - 2FA'],
      body: {
        type: 'object',
        required: ['otp'],
        properties: {
          otp: { type: 'string', pattern: '^[0-9]{6}$' },
        },
      },
    },
  }, async (req, reply) => {
    const token = extractToken(req);
    if (!token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized: Session required to disable 2FA',
      });
    }

    try {
      const { otp } = req.body;
      const res = await authService.disable2FA(token, otp);
      return reply.status(200).send(res);
    } catch (err: any) {
      req.log.error(err);
      const isValidationError = /invalid otp format/i.test(err?.message || '');
      return reply.status(isValidationError ? 400 : 401).send({
        statusCode: isValidationError ? 400 : 401,
        error: isValidationError ? 'Bad Request' : 'Unauthorized',
        message: err?.message || 'Failed to disable 2FA',
      });
    }
  });

  // Phase 2: 2FA Challenge Verification (Secondary Step)
  server.post<{ Body: Verify2FAChallengeBody }>('/api/auth/2fa/verify-challenge', {
    schema: {
      description: 'Verify 2FA challenge code and complete login',
      tags: ['Authentication - 2FA'],
      body: {
        type: 'object',
        required: ['email', 'password', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          otp: { type: 'string', pattern: '^[0-9]{6}$' },
          challengeToken: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { email, password, otp, challengeToken } = req.body;

      if (challengeToken) {
        const verified = authService.verifyChallengeToken(challengeToken);
        if (verified.email.toLowerCase() !== email.toLowerCase()) {
          return reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Challenge token email mismatch',
          });
        }
      }

      const result = await authService.login(email, password, otp);

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
      const isValidationError = /invalid otp format/i.test(err?.message || '');
      return reply.status(isValidationError ? 400 : 401).send({
        statusCode: isValidationError ? 400 : 401,
        error: isValidationError ? 'Bad Request' : 'Unauthorized',
        message: err?.message || 'Failed to verify 2FA challenge',
      });
    }
  });

  // Phase 3: Initiate Social SSO / OAuth (Google / GitHub)
  server.get<{ Params: { provider: string }; Querystring: { returnTo?: string; mode?: 'redirect' | 'json' } }>('/api/auth/oauth/:provider', {
    schema: {
      description: 'Initiate Social Sign-On (OAuth 2.0 / OpenID Connect) via Directus',
      tags: ['Authentication - SSO'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'OAuth provider (e.g., google, github)' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          returnTo: { type: 'string', description: 'URL to redirect after successful authentication' },
          mode: { type: 'string', enum: ['redirect', 'json'], default: 'redirect' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { provider } = req.params;
      const { returnTo, mode } = req.query;

      // Extract protocol and host from request if available
      const host = req.headers.host;
      const protocol = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
      const callbackBaseUrl = host ? `${protocol}://${host}` : undefined;

      const { url, state } = authService.getOAuthLoginUrl(provider, returnTo, callbackBaseUrl);

      const isJsonPreferred = mode === 'json' || req.headers.accept?.includes('application/json');
      if (isJsonPreferred) {
        return reply.status(200).send({
          success: true,
          provider,
          url,
          state,
        });
      }

      return reply.code(302).redirect(url);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err?.message || 'Failed to initiate OAuth',
      });
    }
  });

  // Phase 3: OAuth SSO Callback Handler
  server.get<{ Querystring: { access_token?: string; refresh_token?: string; expires?: string; state?: string; error?: string; mode?: 'redirect' | 'json' } }>('/api/auth/oauth/callback', {
    schema: {
      description: 'OAuth callback receiver: sets HttpOnly session cookies and redirects to destination',
      tags: ['Authentication - SSO'],
      querystring: {
        type: 'object',
        properties: {
          access_token: { type: 'string' },
          refresh_token: { type: 'string' },
          expires: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
          mode: { type: 'string', enum: ['redirect', 'json'] },
        },
      },
    },
  }, async (req, reply) => {
    const { access_token, refresh_token, expires, state, error, mode } = req.query;

    if (error) {
      req.log.error(`OAuth callback error: ${error}`);
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: `OAuth authentication failed: ${error}`,
      });
    }

    if (!access_token) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing access token in OAuth callback',
      });
    }

    // Resolve returnTo from signed state or fallback to default frontendUrl
    let returnTo = config.frontendUrl;
    if (state) {
      try {
        const verified = authService.verifyOAuthState(state);
        if (verified.returnTo) {
          returnTo = verified.returnTo;
        }
      } catch (err) {
        req.log.warn(err, 'Failed to verify OAuth state; falling back to default destination');
      }
    }

    // Set session cookies
    reply.setCookie('session_token', access_token, {
      ...cookieOptions,
      maxAge: expires ? Math.floor(parseInt(expires, 10) / 1000) : 900,
    });

    if (refresh_token) {
      reply.setCookie('refresh_token', refresh_token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    const isJsonPreferred = mode === 'json' || req.headers.accept?.includes('application/json');
    if (isJsonPreferred) {
      return reply.status(200).send({
        success: true,
        message: 'OAuth authentication successful',
        access_token,
        returnTo,
      });
    }

    return reply.code(302).redirect(returnTo);
  });
}
