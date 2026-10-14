import crypto from 'crypto';
import QRCode from 'qrcode';
import { readMe, registerUser, customEndpoint, readItems, createItem, passwordRequest, passwordReset, updateMe } from '@directus/sdk';
import { createBaseDirectusClient, createUserDirectusClient } from './directus.client.js';
import { config } from '../config/env.js';

export interface LoginResult {
  access_token?: string;
  refresh_token?: string;
  expires?: number;
  requires2FA?: boolean;
  challengeToken?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
}

export interface TwoFactorSetupResult {
  secret: string;
  otpauth_url: string;
  qr_code: string;
}

export class AuthService {
  private client: any;
  private serviceTokenCache = new Map<string, { user: any; expiresAt: number }>();

  constructor(client?: any) {
    this.client = client || createBaseDirectusClient();
  }

  validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  validateOTP(otp: string): void {
    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      throw new Error('Invalid OTP format: TOTP code must be 6 numeric digits');
    }
  }

  generateOAuthState(provider: string, returnTo?: string): string {
    const payload = JSON.stringify({
      provider,
      returnTo: returnTo || config.frontendUrl,
      exp: Date.now() + 10 * 60 * 1000,
    });
    const hmac = crypto.createHmac('sha256', config.cookieSecret).update(payload).digest('hex');
    return Buffer.from(JSON.stringify({ payload, hmac })).toString('base64url');
  }

  verifyOAuthState(state: string): { provider: string; returnTo: string } {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      const expectedHmac = crypto.createHmac('sha256', config.cookieSecret).update(decoded.payload).digest('hex');
      if (expectedHmac !== decoded.hmac) {
        throw new Error('Invalid state signature');
      }
      const data = JSON.parse(decoded.payload);
      if (Date.now() > data.exp) {
        throw new Error('OAuth state expired');
      }
      return { provider: data.provider, returnTo: data.returnTo };
    } catch {
      throw new Error('Invalid or expired OAuth state');
    }
  }

  getOAuthLoginUrl(provider: string, returnTo?: string, callbackBaseUrl?: string): { url: string; state: string } {
    const normalizedProvider = provider.toLowerCase().trim();
    if (!config.allowedOAuthProviders.includes(normalizedProvider)) {
      throw new Error(`Unsupported OAuth provider: ${provider}. Allowed providers: ${config.allowedOAuthProviders.join(', ')}`);
    }

    const state = this.generateOAuthState(normalizedProvider, returnTo);
    const callbackUrl = `${callbackBaseUrl || config.appUrl}/api/auth/oauth/callback?state=${encodeURIComponent(state)}`;
    const directusOAuthUrl = `${config.directusUrl}/auth/login/${normalizedProvider}?redirect=${encodeURIComponent(callbackUrl)}`;

    return {
      url: directusOAuthUrl,
      state,
    };
  }

  generateChallengeToken(email: string): string {
    const payload = JSON.stringify({ email, exp: Date.now() + 5 * 60 * 1000 });
    const hmac = crypto.createHmac('sha256', config.cookieSecret).update(payload).digest('hex');
    return Buffer.from(JSON.stringify({ payload, hmac })).toString('base64url');
  }

  verifyChallengeToken(token: string): { email: string } {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const expectedHmac = crypto.createHmac('sha256', config.cookieSecret).update(decoded.payload).digest('hex');
      if (expectedHmac !== decoded.hmac) {
        throw new Error('Invalid challenge signature');
      }
      const data = JSON.parse(decoded.payload);
      if (Date.now() > data.exp) {
        throw new Error('2FA challenge token expired');
      }
      return { email: data.email };
    } catch {
      throw new Error('Invalid or expired 2FA challenge token');
    }
  }

  async login(email: string, password: string, otp?: string): Promise<LoginResult> {
    this.validateEmail(email);

    if (!password) {
      throw new Error('Password is required');
    }

    if (otp !== undefined && otp !== null && otp !== '') {
      this.validateOTP(otp);
    }

    try {
      const options = otp ? { otp } : undefined;
      const res = await (options ? this.client.login(email, password, options) : this.client.login(email, password));

      return {
        access_token: res.access_token,
        refresh_token: res.refresh_token,
        expires: res.expires,
        requires2FA: false,
      };
    } catch (error: any) {
      const errorList = error?.errors || (error?.response?.data?.errors ?? []);
      const is2FA = errorList.some(
        (err: any) =>
          err?.extensions?.code === 'TWO_FACTOR_REQUIRED' ||
          /two-factor authentication/i.test(err?.message || '')
      );

      if (is2FA) {
        return {
          requires2FA: true,
          challengeToken: this.generateChallengeToken(email),
        };
      }

      throw error;
    }
  }

  async register(input: RegisterInput): Promise<any> {
    this.validateEmail(input.email);

    if (!input.password || input.password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    return await this.client.request(registerUser(input.email, input.password, {
      first_name: input.firstName,
      last_name: input.lastName,
    }));
  }

  async logout(refreshToken?: string): Promise<void> {
    if (typeof this.client.logout === 'function') {
      await this.client.logout(refreshToken);
    }
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    if (typeof this.client.refresh === 'function') {
      const res = await this.client.refresh('json', refreshToken);
      return {
        access_token: res.access_token,
        refresh_token: res.refresh_token,
        expires: res.expires,
      };
    }

    throw new Error('Directus client does not support refresh');
  }

  async getUserProfile(accessToken: string): Promise<any> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    const userClient = createUserDirectusClient(accessToken);
    return await userClient.request(readMe({
      fields: ['id', 'email', 'first_name', 'last_name', 'role', 'status', 'tfa_secret', 'avatar'],
    }));
  }

  async generate2FA(accessToken: string): Promise<TwoFactorSetupResult> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    const userClient = createUserDirectusClient(accessToken);
    const result = await userClient.request(customEndpoint({
      path: '/users/me/tfa/generate',
      method: 'POST',
    })) as { secret: string; url: string };

    const secret = result.secret;
    const otpauth_url = result.url;
    const qr_code = await QRCode.toDataURL(otpauth_url);

    return {
      secret,
      otpauth_url,
      qr_code,
    };
  }

  async enable2FA(accessToken: string, secret: string, otp: string): Promise<{ success: boolean; message: string }> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }
    if (!secret) {
      throw new Error('TOTP secret is required');
    }
    this.validateOTP(otp);

    const userClient = createUserDirectusClient(accessToken);
    await userClient.request(customEndpoint({
      path: '/users/me/tfa/enable',
      method: 'POST',
      body: JSON.stringify({ otp, secret }),
    }));

    return {
      success: true,
      message: 'Two-factor authentication successfully enabled',
    };
  }

  async disable2FA(accessToken: string, otp: string): Promise<{ success: boolean; message: string }> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }
    this.validateOTP(otp);

    const userClient = createUserDirectusClient(accessToken);
    await userClient.request(customEndpoint({
      path: '/users/me/tfa/disable',
      method: 'POST',
      body: JSON.stringify({ otp }),
    }));

    return {
      success: true,
      message: 'Two-factor authentication successfully disabled',
    };
  }

  // Phase 4: Validate Static Service Token with in-memory caching
  async validateServiceToken(token: string): Promise<any> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Malformed or missing Bearer token');
    }

    const trimmedToken = token.trim();

    // Check in-memory TTL cache
    const cached = this.serviceTokenCache.get(trimmedToken);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    try {
      const userClient = createUserDirectusClient(trimmedToken);
      const user = await userClient.request(readMe({
        fields: ['id', 'email', 'first_name', 'last_name', 'role', 'status'],
      }));

      if (!user) {
        throw new Error('Invalid or expired Bearer token');
      }

      // Cache token for 5 minutes
      this.serviceTokenCache.set(trimmedToken, {
        user,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return user;
    } catch {
      this.serviceTokenCache.delete(trimmedToken);
      throw new Error('Invalid or expired Bearer token');
    }
  }

  clearServiceTokenCache(): void {
    this.serviceTokenCache.clear();
  }

  // Phase 4: Stateless Directus Collection Data Operations
  async getCollectionData(token: string, collection: string, query?: Record<string, any>): Promise<any> {
    await this.validateServiceToken(token);
    const userClient = createUserDirectusClient(token);
    return await userClient.request(readItems(collection, query as any));
  }

  async createCollectionData(token: string, collection: string, item: Record<string, any>): Promise<any> {
    await this.validateServiceToken(token);
    const userClient = createUserDirectusClient(token);
    return await userClient.request(createItem(collection, item));
  }

  // Phase 7: Password Reset & Account Management
  async requestPasswordReset(email: string, resetUrl?: string): Promise<{ success: boolean; message: string }> {
    this.validateEmail(email);

    try {
      const targetResetUrl = resetUrl || `${config.appUrl}/`;
      await this.client.request(passwordRequest(email, targetResetUrl));
    } catch {
      // Security: user enumeration protection - always return generic success message
    }

    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Reset token is required');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    try {
      await this.client.request(passwordReset(token.trim(), password));
      return {
        success: true,
        message: 'Password has been successfully reset. You may now log in.',
      };
    } catch (error: any) {
      throw new Error('Invalid or expired password reset token');
    }
  }

  async updateUserPassword(accessToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const userClient = createUserDirectusClient(accessToken);
    await userClient.request(updateMe({ password: newPassword }));

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  async updateUserProfile(accessToken: string, data: { firstName?: string; lastName?: string }): Promise<any> {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    const payload: Record<string, any> = {};
    if (data.firstName !== undefined) payload.first_name = data.firstName;
    if (data.lastName !== undefined) payload.last_name = data.lastName;

    const userClient = createUserDirectusClient(accessToken);
    return await userClient.request(updateMe(payload));
  }
}

