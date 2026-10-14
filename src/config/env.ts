import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  directusUrl: process.env.DIRECTUS_URL || 'https://directus.ymatt.online',
  directusAdminToken: process.env.DIRECTUS_ADMIN_TOKEN || '',
  cookieSecret: process.env.COOKIE_SECRET || 'a-very-long-secret-key-that-is-at-least-32-characters',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  defaultMemberRoleName: process.env.DEFAULT_MEMBER_ROLE_NAME || 'Member',
  serviceRoleName: process.env.SERVICE_ROLE_NAME || 'Service Accounts',
};
