import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../../server.js';

describe('GET /api/user/profile (Auth Guard Integration)', () => {
  let server: any;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns HTTP 401 when no session cookie is present', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/user/profile',
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toMatch(/unauthorized/i);
  });
});
