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

  it('POST /api/auth/login sets HttpOnly session cookies upon successful login', async () => {
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

    // Check Set-Cookie headers
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieArray.some((c: string) => c.includes('session_token=test-access-token-xyz'))).toBe(true);
    expect(cookieArray.some((c: string) => c.includes('refresh_token=test-refresh-token-abc'))).toBe(true);
    expect(cookieArray.some((c: string) => c.includes('HttpOnly'))).toBe(true);
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
    // Check that cookies are cleared (max-age=0 or expires in past)
    expect(cookieArray.some((c: string) => c.includes('session_token=;') || c.includes('Max-Age=0'))).toBe(true);
  });
});
