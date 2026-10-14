import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestServer } from '../../server.js';
import { AuthService } from '../../services/auth.service.js';

describe('Auth Flow End-to-End Integration Tests', () => {
  let server: any;
  let mockAuthService: any;

  beforeAll(async () => {
    mockAuthService = {
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      getUserProfile: vi.fn(),
      generate2FA: vi.fn(),
      enable2FA: vi.fn(),
      disable2FA: vi.fn(),
      verifyChallengeToken: vi.fn(),
      validateOTP: vi.fn((otp: string) => {
        if (!otp || !/^\d{6}$/.test(otp.trim())) {
          throw new Error('Invalid OTP format: TOTP code must be 6 numeric digits');
        }
      }),
      getOAuthLoginUrl: vi.fn((provider: string, returnTo?: string) => {
        if (!['google', 'github'].includes(provider.toLowerCase())) {
          throw new Error(`Unsupported OAuth provider: ${provider}`);
        }
        return {
          url: `https://directus.ymatt.online/auth/login/${provider}?redirect=encoded-callback`,
          state: 'mock-oauth-state',
        };
      }),
      verifyOAuthState: vi.fn((state: string) => {
        if (state === 'invalid-state') throw new Error('Invalid state');
        return { provider: 'google', returnTo: 'https://ymatt.online/custom-dest' };
      }),
    };

    server = await createTestServer({
      authService: mockAuthService as unknown as AuthService,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /healthz returns status ok', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/healthz',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
  });

  it('POST /api/auth/login sets HttpOnly session cookies upon successful login without 2FA', async () => {
    mockAuthService.login.mockResolvedValueOnce({
      access_token: 'test-access-token-xyz',
      refresh_token: 'test-refresh-token-abc',
      expires: 900000,
      requires2FA: false,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'user@example.com',
        password: 'ValidPassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.access_token).toBe('test-access-token-xyz');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieArray.some((c: string) => c.includes('session_token=test-access-token-xyz'))).toBe(true);
    expect(cookieArray.some((c: string) => c.includes('refresh_token=test-refresh-token-abc'))).toBe(true);
    expect(cookieArray.some((c: string) => c.includes('HttpOnly'))).toBe(true);
  });

  // Phase 2 Spec: Accounts with 2FA enabled cannot access protected routes without secondary verification
  describe('Phase 2: 2FA Challenge & Access Enforcement', () => {
    it('login returns 2FA challenge and does NOT set session cookies when 2FA is required', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        requires2FA: true,
        challengeToken: 'signed-mock-challenge-token',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: '2fa-user@example.com',
          password: 'ValidPassword123!',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.requires2FA).toBe(true);
      expect(body.challengeToken).toBe('signed-mock-challenge-token');

      // Crucial: No session cookies are issued yet
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeUndefined();
    });

    it('protected route blocks access when only 2FA challenge is present without verified session', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/user/profile',
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toMatch(/unauthorized/i);
    });

    it('rejects 2FA verification with non-6-digit OTP code', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/verify-challenge',
        payload: {
          email: '2fa-user@example.com',
          password: 'ValidPassword123!',
          otp: '12345', // only 5 digits
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBeDefined();
    });

    it('successfully completes 2FA challenge and issues session cookies upon valid OTP', async () => {
      mockAuthService.verifyChallengeToken.mockReturnValueOnce({ email: '2fa-user@example.com' });
      mockAuthService.login.mockResolvedValueOnce({
        access_token: 'verified-2fa-access-token',
        refresh_token: 'verified-2fa-refresh-token',
        expires: 900000,
        requires2FA: false,
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/verify-challenge',
        payload: {
          email: '2fa-user@example.com',
          password: 'ValidPassword123!',
          otp: '123456',
          challengeToken: 'signed-mock-challenge-token',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.access_token).toBe('verified-2fa-access-token');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes('session_token=verified-2fa-access-token'))).toBe(true);
    });
  });

  // Phase 2: 2FA Setup Lifecycle (Generate, Enable, Disable)
  describe('Phase 2: 2FA Setup Lifecycle', () => {
    it('POST /api/auth/2fa/generate returns 401 when unauthenticated', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/generate',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/auth/2fa/generate returns secret, otpauth_url, and qr_code with session cookie', async () => {
      mockAuthService.generate2FA.mockResolvedValueOnce({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Directus:user@example.com?secret=JBSWY3DPEHPK3PXP',
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/generate',
        cookies: {
          session_token: 'valid-session-token',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(body.otpauth_url).toContain('otpauth://totp');
      expect(body.qr_code).toMatch(/^data:image\/png;base64,/);
    });

    it('POST /api/auth/2fa/enable validates OTP and enables 2FA', async () => {
      mockAuthService.enable2FA.mockResolvedValueOnce({
        success: true,
        message: 'Two-factor authentication successfully enabled',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/enable',
        cookies: {
          session_token: 'valid-session-token',
        },
        payload: {
          secret: 'JBSWY3DPEHPK3PXP',
          otp: '123456',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).success).toBe(true);
    });

    it('POST /api/auth/2fa/disable validates OTP and disables 2FA', async () => {
      mockAuthService.disable2FA.mockResolvedValueOnce({
        success: true,
        message: 'Two-factor authentication successfully disabled',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/2fa/disable',
        cookies: {
          session_token: 'valid-session-token',
        },
        payload: {
          otp: '654321',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).success).toBe(true);
    });
  });

  // Phase 3 Spec: Social Sign-On (OAuth 2.0 / OpenID Connect)
  describe('Phase 3: Social Sign-On (OAuth 2.0 / OpenID Connect)', () => {
    it('GET /api/auth/oauth/:provider initiates OAuth with 302 redirect', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/google',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('https://directus.ymatt.online/auth/login/google');
    });

    it('GET /api/auth/oauth/:provider?mode=json returns JSON OAuth URL for SPAs', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/github?mode=json',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.provider).toBe('github');
      expect(body.url).toContain('https://directus.ymatt.online/auth/login/github');
    });

    it('GET /api/auth/oauth/:provider rejects unsupported providers', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/unsupported_provider',
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/unsupported oauth provider/i);
    });

    it('GET /api/auth/oauth/callback returns 401 on Directus OAuth error', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/callback?error=user_cancelled',
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain('user_cancelled');
    });

    it('GET /api/auth/oauth/callback returns 401 if access_token is missing', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/callback',
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toMatch(/missing access token/i);
    });

    it('GET /api/auth/oauth/callback successfully hydrates session cookies and redirects', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/callback?access_token=oauth-access-token-123&refresh_token=oauth-refresh-token-456&state=mock-oauth-state',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('https://ymatt.online/custom-dest');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes('session_token=oauth-access-token-123'))).toBe(true);
      expect(cookieArray.some((c: string) => c.includes('refresh_token=oauth-refresh-token-456'))).toBe(true);
      expect(cookieArray.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('GET /api/auth/oauth/callback supports mode=json with hydrated session cookies', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/oauth/callback?access_token=oauth-json-access-token&mode=json',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.access_token).toBe('oauth-json-access-token');

      const cookies = res.headers['set-cookie'];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes('session_token=oauth-json-access-token'))).toBe(true);
    });
  });

  it('GET /api/user/profile succeeds when session_token cookie is present', async () => {
    mockAuthService.getUserProfile.mockResolvedValueOnce({
      id: 'usr-12345',
      email: 'user@example.com',
      first_name: 'John',
      last_name: 'Doe',
      role: 'Member',
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/user/profile',
      cookies: {
        session_token: 'valid-session-token',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('usr-12345');
    expect(body.email).toBe('user@example.com');
  });

  it('POST /api/auth/logout clears session cookies', async () => {
    mockAuthService.logout.mockResolvedValueOnce(undefined);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        session_token: 'active-session-token',
        refresh_token: 'active-refresh-token',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const cookies = res.headers['set-cookie'];
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieArray.some((c: string) => c.includes('session_token=;') || c.includes('Max-Age=0'))).toBe(true);
  });
});
