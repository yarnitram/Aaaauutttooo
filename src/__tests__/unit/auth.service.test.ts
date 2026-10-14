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
  });

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
});
