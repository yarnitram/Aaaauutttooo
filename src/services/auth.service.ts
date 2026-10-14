import { createUser, readMe, registerUser } from '@directus/sdk';
import { createBaseDirectusClient, createUserDirectusClient } from './directus.client.js';

export interface LoginResult {
  access_token?: string;
  refresh_token?: string;
  expires?: number;
  requires2FA?: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
}

export class AuthService {
  private client: any;

  constructor(client?: any) {
    this.client = client || createBaseDirectusClient();
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  async login(email: string, password: string, otp?: string): Promise<LoginResult> {
    this.validateEmail(email);

    if (!password) {
      throw new Error('Password is required');
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

    const payload: Record<string, any> = {
      email: input.email,
      password: input.password,
    };

    if (input.firstName) payload.first_name = input.firstName;
    if (input.lastName) payload.last_name = input.lastName;
    if (input.roleId) payload.role = input.roleId;

    // Use registerUser (public registration) or createUser
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
      fields: ['id', 'email', 'first_name', 'last_name', 'role', 'status', 'avatar'],
    }));
  }
}
