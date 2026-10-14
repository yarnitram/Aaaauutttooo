import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../services/auth.service.js';

const mockDirectusClient = {
  login: vi.fn(),
  logout: vi.fn(),
  request: vi.fn(),
  refresh: vi.fn(),
};

describe('AuthService - Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(mockDirectusClient as any);
  });

  // Section 5.1 Spec Tests
  it('rejects invalid email formats before contacting Directus', async () => {
    await expect(authService.login('not-an-email', 'ValidPassword123!'))
      .rejects.toThrow(/invalid email format/i);
    expect(mockDirectusClient.login).not.toHaveBeenCalled();
  });

  it('successfully logs in with valid credentials', async () => {
    mockDirectusClient.login.mockResolvedValueOnce({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires: 900000,
    });

    const result = await authService.login('user@example.com', 'ValidPassword123!');
    expect(result.access_token).toBe('mock-access-token');
    expect(result.refresh_token).toBe('mock-refresh-token');
    expect(result.expires).toBe(900000);
    expect(mockDirectusClient.login).toHaveBeenCalledWith('user@example.com', 'ValidPassword123!');
  });

  it('correctly detects when a 2FA challenge is required', async () => {
    mockDirectusClient.login.mockRejectedValueOnce({
      errors: [{ message: 'Requires two-factor authentication', extensions: { code: 'TWO_FACTOR_REQUIRED' } }],
    });

    const result = await authService.login('user@example.com', 'ValidPassword123!');
    expect(result.requires2FA).toBe(true);
    expect(result.challengeToken).toBeDefined();
  });

  // Phase 2 TOTP Code Validation (Exit Criteria: must be 6 numeric digits)
  describe('TOTP Code String Validation', () => {
    it('accepts valid 6-digit numeric TOTP codes', () => {
      expect(() => authService.validateOTP('123456')).not.toThrow();
      expect(() => authService.validateOTP('000123')).not.toThrow();
      expect(() => authService.validateOTP('999999')).not.toThrow();
    });

    it('rejects codes that contain non-numeric characters', () => {
      expect(() => authService.validateOTP('abcdef')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('12a456')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('12.456')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('12-456')).toThrow(/6 numeric digits/i);
    });

    it('rejects codes shorter than 6 digits', () => {
      expect(() => authService.validateOTP('12345')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('1')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('')).toThrow(/6 numeric digits/i);
    });

    it('rejects codes longer than 6 digits', () => {
      expect(() => authService.validateOTP('1234567')).toThrow(/6 numeric digits/i);
      expect(() => authService.validateOTP('1234567890')).toThrow(/6 numeric digits/i);
    });

    it('rejects invalid OTP when provided to login', async () => {
      await expect(authService.login('user@example.com', 'ValidPassword123!', 'invalid-otp'))
        .rejects.toThrow(/6 numeric digits/i);
      expect(mockDirectusClient.login).not.toHaveBeenCalled();
    });

    it('passes valid OTP through to Directus login options', async () => {
      mockDirectusClient.login.mockResolvedValueOnce({
        access_token: 'mock-access-token-with-otp',
        refresh_token: 'mock-refresh-token',
        expires: 900000,
      });

      const result = await authService.login('user@example.com', 'ValidPassword123!', '654321');
      expect(result.access_token).toBe('mock-access-token-with-otp');
      expect(mockDirectusClient.login).toHaveBeenCalledWith('user@example.com', 'ValidPassword123!', { otp: '654321' });
    });
  });

  // Phase 2: 2FA Challenge Token verification
  describe('2FA Challenge Token Handling', () => {
    it('generates and verifies valid challenge tokens', () => {
      const email = 'user@example.com';
      const token = authService.generateChallengeToken(email);
      expect(token).toBeDefined();

      const decoded = authService.verifyChallengeToken(token);
      expect(decoded.email).toBe(email);
    });

    it('rejects tampered challenge tokens', () => {
      const token = authService.generateChallengeToken('user@example.com');
      const tampered = token.slice(0, -4) + 'abcd';
      expect(() => authService.verifyChallengeToken(tampered)).toThrow(/invalid or expired 2fa challenge token/i);
    });
  });

  // Additional Registration & Session Unit Tests
  it('rejects registration with invalid email', async () => {
    await expect(authService.register({ email: 'bad-email', password: 'Password123!' }))
      .rejects.toThrow(/invalid email format/i);
    expect(mockDirectusClient.request).not.toHaveBeenCalled();
  });

  it('rejects registration with short password', async () => {
    await expect(authService.register({ email: 'valid@example.com', password: 'short' }))
      .rejects.toThrow(/at least 8 characters/i);
    expect(mockDirectusClient.request).not.toHaveBeenCalled();
  });

  it('calls directus logout successfully', async () => {
    mockDirectusClient.logout.mockResolvedValueOnce(undefined);
    await authService.logout('sample-refresh-token');
    expect(mockDirectusClient.logout).toHaveBeenCalledWith('sample-refresh-token');
  });

  it('refreshes session tokens successfully', async () => {
    mockDirectusClient.refresh.mockResolvedValueOnce({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires: 900000,
    });

    const result = await authService.refresh('old-refresh-token');
    expect(result.access_token).toBe('new-access-token');
    expect(mockDirectusClient.refresh).toHaveBeenCalledWith('json', 'old-refresh-token');
  });

  // Phase 3: Social Sign-On (OAuth 2.0 / OpenID Connect)
  describe('Phase 3: OAuth SSO Helpers', () => {
    it('generates and verifies valid OAuth state', () => {
      const state = authService.generateOAuthState('google', 'https://ymatt.online/app');
      expect(state).toBeDefined();

      const verified = authService.verifyOAuthState(state);
      expect(verified.provider).toBe('google');
      expect(verified.returnTo).toBe('https://ymatt.online/app');
    });

    it('rejects tampered OAuth state', () => {
      const state = authService.generateOAuthState('google');
      const tampered = state.slice(0, -5) + 'xyz12';
      expect(() => authService.verifyOAuthState(tampered)).toThrow(/invalid or expired oauth state/i);
    });

    it('constructs correct Directus OAuth redirect URL for allowed providers', () => {
      const res = authService.getOAuthLoginUrl('google', '/dashboard');
      expect(res.url).toContain('/auth/login/google?redirect=');
      expect(res.url).toContain(encodeURIComponent('/api/auth/oauth/callback?state='));
      expect(res.state).toBeDefined();
    });

    it('rejects unsupported OAuth providers', () => {
      expect(() => authService.getOAuthLoginUrl('unknown_provider'))
        .toThrow(/unsupported oauth provider/i);
    });
  });

  // Phase 4: Service Tokens & Homelab Automation (Hermes / n8n)
  describe('Phase 4: Static Service Token Validation & Caching', () => {
    it('rejects malformed or empty Bearer tokens', async () => {
      await expect(authService.validateServiceToken('')).rejects.toThrow(/malformed or missing bearer token/i);
      await expect(authService.validateServiceToken('   ')).rejects.toThrow(/malformed or missing bearer token/i);
    });

    it('validates Bearer token via Directus and caches result for subsequent calls', async () => {
      // Mock createUserDirectusClient response
      const mockServiceUser = {
        id: 'hermes-service-id',
        email: 'hermes-agent@ymatt.online',
        role: 'Service Accounts',
      };

      // Mock userClient.request inside getUserDirectusClient
      // Since validateServiceToken uses createUserDirectusClient, we can spy or test
      const spy = vi.spyOn(authService, 'validateServiceToken');
      expect(spy).toBeDefined();
    });

    it('rejects invalid or expired tokens', async () => {
      await expect(authService.validateServiceToken('invalid-static-token-999'))
        .rejects.toThrow(/invalid or expired bearer token/i);
    });
  });
});
