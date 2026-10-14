# Directus SSO & OAuth 2.0 Configuration Guide

This guide documents the configuration required on the **Directus 11+** host (Proxmox Docker LXC `192.168.2.6`) to enable Social Sign-On with **Google** and **GitHub**, automatically mapping authenticated users to the default `Member` role.

---

## 1. Directus Environment Variables (`docker-compose.yml`)

Add or update the following environment block in `/root/directus/docker-compose.yml` on `192.168.2.6`:

```yaml
services:
  directus:
    image: directus/directus:11.5.0
    environment:
      # Enabled Providers
      AUTH_PROVIDERS: "google,github"

      # Google OpenID Connect Provider
      AUTH_GOOGLE_DRIVER: "openid"
      AUTH_GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
      AUTH_GOOGLE_CLIENT_SECRET: "YOUR_GOOGLE_CLIENT_SECRET"
      AUTH_GOOGLE_ISSUER_URL: "https://accounts.google.com"
      AUTH_GOOGLE_IDENTIFIER_KEY: "email"
      AUTH_GOOGLE_ICON: "google"
      AUTH_GOOGLE_LABEL: "Google"
      AUTH_GOOGLE_ALLOW_PUBLIC_REGISTRATION: "true"
      AUTH_GOOGLE_DEFAULT_ROLE_ID: "<MEMBER_ROLE_UUID>" # Resolved dynamically via 'npm run seed'

      # GitHub OAuth 2.0 Provider
      AUTH_GITHUB_DRIVER: "oauth2"
      AUTH_GITHUB_CLIENT_ID: "YOUR_GITHUB_CLIENT_ID"
      AUTH_GITHUB_CLIENT_SECRET: "YOUR_GITHUB_CLIENT_SECRET"
      AUTH_GITHUB_AUTHORIZE_URL: "https://github.com/login/oauth/authorize"
      AUTH_GITHUB_ACCESS_URL: "https://github.com/login/oauth/access_token"
      AUTH_GITHUB_PROFILE_URL: "https://api.github.com/user"
      AUTH_GITHUB_IDENTIFIER_KEY: "email"
      AUTH_GITHUB_ICON: "github"
      AUTH_GITHUB_LABEL: "GitHub"
      AUTH_GITHUB_ALLOW_PUBLIC_REGISTRATION: "true"
      AUTH_GITHUB_DEFAULT_ROLE_ID: "<MEMBER_ROLE_UUID>" # Resolved dynamically via 'npm run seed'
```

---

## 2. Authorized Redirect URIs in Developer Consoles

### Google Cloud Console:
- **Authorized JavaScript origins:** `https://directus.ymatt.online`, `https://auth.ymatt.online`
- **Authorized redirect URIs:**
  - `https://directus.ymatt.online/auth/login/google/callback`

### GitHub Developer Settings (OAuth Apps):
- **Homepage URL:** `https://auth.ymatt.online`
- **Authorization callback URL:**
  - `https://directus.ymatt.online/auth/login/github/callback`

---

## 3. Fastify BFF OAuth Endpoints

1. **Initiate OAuth Login:**
   - `GET https://auth.ymatt.online/api/auth/oauth/google?returnTo=/dashboard`
   - `GET https://auth.ymatt.online/api/auth/oauth/github?returnTo=/dashboard`
   - By default, returns an HTTP 302 redirecting the browser to Directus SSO login.
   - For SPA/JSON callers, append `?mode=json` or pass `Accept: application/json` to receive `{ url: "..." }`.

2. **Handle SSO Callback:**
   - `GET https://auth.ymatt.online/api/auth/oauth/callback?access_token=...&refresh_token=...&state=...`
   - Automatically sets encrypted HttpOnly cookies (`session_token`, `refresh_token`).
   - Redirects the user's browser back to `returnTo` or the configured `FRONTEND_URL`.
