import { createDirectus, rest, authentication, staticToken } from '@directus/sdk';
import { config } from '../config/env.js';

export function createBaseDirectusClient(baseUrl: string = config.directusUrl) {
  return createDirectus(baseUrl)
    .with(rest())
    .with(authentication('json'));
}

export function createAdminDirectusClient(baseUrl: string = config.directusUrl, token: string = config.directusAdminToken) {
  return createDirectus(baseUrl)
    .with(rest())
    .with(staticToken(token));
}

export function createUserDirectusClient(token: string, baseUrl: string = config.directusUrl) {
  return createDirectus(baseUrl)
    .with(rest())
    .with(staticToken(token));
}
