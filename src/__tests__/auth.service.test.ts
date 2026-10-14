import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../services/auth.service.js';

describe('AuthService (Unit Tests)', () => {
  const mockDirectus = {
    request: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(mockDirectus as any);
  });

  it('rejects registration with invalid email without contacting Directus', async () => {
    await expect(
      service.register({ email: 'bad-email', password: 'ValidPassword123' })
    ).rejects.toThrow(/invalid email/i);

    expect(mockDirectus.request).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(
      service.register({ email: 'test@example.com', password: 'short' })
    ).rejects.toThrow(/at least 8 characters/i);

    expect(mockDirectus.request).not.toHaveBeenCalled();
  });

  it('successfully calls Directus login on valid credentials', async () => {
    mockDirectus.login.mockResolvedValueOnce({
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      expires: 900000,
    });

    const result = await service.login({
      email: 'valid@example.com',
      password: 'ValidPassword123',
    });

    expect(result.access_token).toBe('mock-token');
    expect(mockDirectus.login).toHaveBeenCalledWith('valid@example.com', 'ValidPassword123');
  });
});
