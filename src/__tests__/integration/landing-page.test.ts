import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer, createTestServer } from '../../server.js';

describe('Landing Page UI & Static Asset Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('boots server in development logger mode without throwing transport errors', async () => {
    const devServer = await buildServer({
      logger: true,
    });
    expect(devServer).toBeDefined();
    await devServer.ready();
    await devServer.close();
  });

  it('GET / serves the HTML landing page with 200 OK', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/i);
    expect(res.body).toContain('<!DOCTYPE html>');
  });

  it('landing page contains interactive login form elements and branding', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.body).toContain('AuthApp');
    expect(res.body).toContain('id="login-form"');
    expect(res.body).toContain('id="login-email"');
    expect(res.body).toContain('id="login-password"');
  });

  it('landing page contains 2FA challenge modal and OTP inputs', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.body).toContain('id="twofa-modal"');
    expect(res.body).toContain('id="otp-code"');
    expect(res.body).toContain('id="verify-otp-btn"');
  });

  it('landing page contains Social SSO buttons and API docs links', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.body).toContain('/api/auth/oauth/google');
    expect(res.body).toContain('/api/auth/oauth/github');
    expect(res.body).toContain('/documentation');
  });

  it('landing page contains forgot password and reset password modals', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.body).toContain('id="forgot-password-link"');
    expect(res.body).toContain('id="forgot-password-modal"');
    expect(res.body).toContain('id="forgot-email-input"');
    expect(res.body).toContain('id="reset-password-modal"');
    expect(res.body).toContain('id="reset-password-input"');
    expect(res.body).toContain('id="reset-token-input"');
  });

  it('landing page contains profile security and change password controls', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.body).toContain('id="toggle-change-pwd-btn"');
    expect(res.body).toContain('id="change-pwd-area"');
    expect(res.body).toContain('id="profile-new-password"');
    expect(res.body).toContain('id="confirm-change-pwd-btn"');
  });
});

