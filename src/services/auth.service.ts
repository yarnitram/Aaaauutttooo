import crypto from 'crypto';
import QRCode from 'qrcode';
import { readMe, registerUser, customEndpoint } from '@directus/sdk';
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
}
