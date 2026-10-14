import { createDirectus, rest, authentication } from '@directus/sdk';
import dotenv from 'dotenv';

dotenv.config();

const directusUrl = process.env.DIRECTUS_URL || 'http://192.168.2.6:8055';

export const createDirectusClient = () => {
  return createDirectus(directusUrl)
    .with(rest())
    .with(authentication('json'));
};
