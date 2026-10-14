import { registerUser, readMe } from '@directus/sdk';
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export class AuthService {
  constructor(private directusClient: any) {}

  async register(input: z.infer<typeof RegisterSchema>) {
    const validated = RegisterSchema.parse(input);
    return await this.directusClient.request(
      registerUser(validated.email, validated.password, {
        first_name: validated.firstName,
        last_name: validated.lastName,
      })
    );
  }

  async login(input: z.infer<typeof LoginSchema>) {
    const validated = LoginSchema.parse(input);
    const authData = await this.directusClient.login(validated.email, validated.password);
    return authData;
  }

  async logout() {
    return await this.directusClient.logout();
  }

  async getProfile() {
    return await this.directusClient.request(readMe());
  }
}
