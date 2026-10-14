# System Specification: Directus-Powered Authentication App (AuthApp)

## 1. Architectural Blueprint

### 1.1 High-Level Architecture
Instead of building a redundant database and custom JWT hashing service, the system leverages **Directus as the Identity Provider (IdP) and Headless Database Engine**. The application layer interacts with Directus via the official `@directus/sdk`, using Directus's native user schema, role-based access control (RBAC), and session management.

- **Identity & Data Platform:** Directus 11+ (running in Docker on Proxmox LXC `192.168.2.6`)
- **Database Engine:** PostgreSQL 16 (running on Proxmox LXC `192.168.2.5`)
- **Application Layer:** TypeScript (Fastify Headless REST API / BFF)
- **API Documentation:** Swagger / OpenAPI via `@fastify/swagger` and `@fastify/swagger-ui`
- **SDK & Transport:** `@directus/sdk` with cookie/session authentication
- **Testing Engine:** Vitest + Supertest / MSW (Mock Service Worker)
- **Production Host:** Proxmox Docker LXC (`192.168.2.6`), routed securely via Cloudflare Tunnel (`auth.ymatt.online`)

```
┌────────────────────────────────────────────────────────┐
│                      Client App                        │
│            (Fastify Headless REST API / BFF)           │
└──────────────────────────┬─────────────────────────────┘
                           │
            HTTPS / Cookie │ Session Token
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Directus Engine                      │
│            (https://directus.ymatt.online)             │
├────────────────────────────────────────────────────────┤
│ [Local Auth] [2FA/TOTP] [OAuth2/OIDC] [API Tokens]     │
│ [Role-Based Access Control] [Permissions Engine]       │
└──────────────────────────┬─────────────────────────────┘
                           │
              Internal SQL │ TCP 5432
                           ▼
┌────────────────────────────────────────────────────────┐
│                 PostgreSQL Database                    │
│                 (LXC IP: 192.168.2.5)                  │
│                [directus_users / roles]                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Supported Directus Authentication Types

Directus provides five distinct authentication mechanisms that are leveraged across this project:

| Authentication Type | Protocol / Driver | Storage / Token Mechanism | Primary Homelab Use Case |
| :--- | :--- | :--- | :--- |
| **1. Local Authentication** | `local` (Argon2 / bcrypt) | Short-lived JWT Access Token + HttpOnly Refresh Cookie | Standard email/password user sign-up and login |
| **2. Two-Factor (2FA / MFA)** | TOTP (RFC 6238) | Authenticator Secret (QR Code / Time-based Token) | High-security accounts and administrator login |
| **3. Social & OpenID SSO** | `oauth2` / `openid` | Authorization Code Grant with PKCE & Role Mapping | One-click login via Google, GitHub, or Discord |
| **4. Enterprise SSO** | `saml` / `ldap` | SAML 2.0 assertions or Active Directory bind | Future organizational or centralized directory auth |
| **5. Static API Tokens** | Static Bearer String | Stored in `directus_users.token` (never expires) | Service-to-service calls (Hermes AI, n8n webhooks) |

---

## 3. Git & CI/CD Pipeline Contract

### 3.1 Branching Convention
- `main`: Production-ready branch. Direct pushes to `main` are strictly blocked.
- `feat/<phase-number>-<feature-name>`: Dedicated feature branches (e.g., `feat/01-directus-local-auth`).
- `fix/<issue-name>`: Hotfixes.

### 3.2 Automated CI/CD Pipeline
Every feature branch must undergo automated testing before being merged to `main`:

```
[Local Workstation]
│
├── 1. Develop against SPEC.md on feat/* branch
├── 2. Run local test suite (npm run test)
└── 3. Push to GitHub (git push origin feat/01-directus-local-auth)
│
[GitHub Actions CI Runner]
│
├── 4. Automated Verification:
│   ├── Dependencies verification (npm ci)
│   ├── TypeScript compiler check (npm run typecheck)
│   ├── Unit tests with Directus SDK mocks (npm run test:unit)
│   └── Contract integration tests (npm run test:int)
│
├── 5. Tests Pass?
│   ├── FAIL ──> Block pull request, alert developer
│   └── PASS ──> Allow pull request merge into main
│
[Production Deployment - Automatically on merge to main]
│
└── 6. Remote Proxmox Deploy (via SSH to 192.168.2.6):
    ├── git pull origin main in project directory
    ├── docker compose build --pull
    ├── Zero-downtime container replacement (docker compose up -d)
    └── Verification check (curl -f https://auth.ymatt.online/healthz)
```

---

## 4. Phased Implementation Roadmap

### Phase 1: Local Email/Password Registration & Session Auth
- **Git Branch:** `feat/01-directus-local-auth`
- **Scope:**
  - Initialize the Directus client using `@directus/sdk` with cookie-based session persistence.
  - Implement User Registration endpoint: creates a user in `directus_users` with a default `Member` role.
  - Implement Login endpoint: verifies credentials via Directus `login()` and issues secure HttpOnly session cookies.
  - Implement Logout & Session Refresh endpoints.
  - Idempotent seed utility (`npm run seed`) to ensure baseline roles (`Member`, `Service Accounts`) exist in Directus.
- **Exit Criteria:**
  - Unit tests verify schema input validation and error mapping for invalid credentials.
  - Integration tests verify that valid logins set HttpOnly cookies and return user profile objects.

### Phase 2: Two-Factor Authentication (2FA / TOTP)
- **Git Branch:** `feat/02-directus-2fa-totp`
- **Scope:**
  - 2FA Setup flow: calls Directus API to generate TOTP secret and QR code for the user.
  - 2FA Verification: confirms OTP code via Directus before finalizing 2FA enablement.
  - 2FA Login enforcement: updates the login endpoint to detect `2FA_REQUIRED` status and handle the secondary TOTP code challenge.
- **Exit Criteria:**
  - Unit tests verify TOTP code string validation (must be 6 numeric digits).
  - Test suite verifies that accounts with 2FA enabled cannot access protected routes without the secondary verification challenge.

### Phase 3: Social Sign-On (OAuth 2.0 / OpenID Connect)
- **Git Branch:** `feat/03-directus-sso-oauth`
- **Scope:**
  - Configure Directus environment variables for SSO providers (Google & GitHub):
    - `AUTH_PROVIDERS="google,github"`
    - `AUTH_GOOGLE_DRIVER="openid"`
    - `AUTH_GOOGLE_CLIENT_ID=...`
    - `AUTH_GOOGLE_CLIENT_SECRET=...`
  - Implement frontend redirect handlers: initiates `/auth/oauth/google` and handles callback URL token receipt.
  - Directus role mapping: newly authenticated SSO users are automatically assigned the default `Member` role.
- **Exit Criteria:**
  - Integration tests verify that OAuth callback queries successfully hydrate user session cookies.

### Phase 4: Service Tokens & Homelab Automation (Hermes / n8n)
- **Git Branch:** `feat/04-service-tokens-and-rbac`
- **Scope:**
  - Provision a dedicated `Service Accounts` role in Directus with scoped permissions.
  - Generate a Static Token for the Hermes AI agent (`192.168.2.7`) and n8n (`192.168.2.6`).
  - Implement an authenticated webhook receiver in the application that validates requests using Bearer token verification against Directus.
- **Exit Criteria:**
  - Unit tests verify that expired or malformed Bearer tokens receive `HTTP 401 Unauthorized`.
  - Service accounts can read and write authorized collections without cookie state.

### Phase 5: CI/CD Pipeline & Proxmox Production Deployment
- **Git Branch:** `feat/05-cicd-proxmox-deploy`
- **Scope:**
  - Create a production multi-stage `Dockerfile`.
  - Add the service to `/root/directus/docker-compose.yml` on the Docker LXC.
  - Create `.github/workflows/ci-cd.yml` with test gates and automated SSH rollout.
- **Exit Criteria:**
  - Pushing to a feature branch runs all Vitest tests.
  - Merging to `main` automatically updates and restarts the container on Proxmox without manual server intervention.

---

## 5. Test Suite Specifications & Code Samples

### 5.1 Unit Test Sample: Local Login & Validation (Vitest)
Unit tests run entirely in-memory using mocks for `@directus/sdk`, ensuring quick execution in CI runners.

```typescript
// src/__tests__/unit/auth.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../services/auth.service';

const mockDirectusClient = {
  login: vi.fn(),
  logout: vi.fn(),
  request: vi.fn(),
};

describe('AuthService - Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(mockDirectusClient as any);
  });

  it('rejects invalid email formats before contacting Directus', async () => {
    await expect(authService.login('not-an-email', 'ValidPassword123!'))
      .rejects.toThrow(/invalid email format/i);
    expect(mockDirectusClient.login).not.toHaveBeenCalled();
  });

  it('successfully logs in with valid credentials', async () => {
    mockDirectusClient.login.mockResolvedValueOnce({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires: 900000,
    });

    const result = await authService.login('user@example.com', 'ValidPassword123!');
    expect(result.access_token).toBe('mock-access-token');
    expect(mockDirectusClient.login).toHaveBeenCalledWith('user@example.com', 'ValidPassword123!');
  });

  it('correctly detects when a 2FA challenge is required', async () => {
    mockDirectusClient.login.mockRejectedValueOnce({
      errors: [{ message: 'Requires two-factor authentication', extensions: { code: 'TWO_FACTOR_REQUIRED' } }],
    });

    const result = await authService.login('user@example.com', 'ValidPassword123!');
    expect(result.requires2FA).toBe(true);
  });
});
```

### 5.2 Integration Test Sample: Protected Route Authentication
```typescript
// src/__tests__/integration/protected-route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer } from '../../server';

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
```

---

## 6. GitHub Actions CI/CD Pipeline Definition

Save to `.github/workflows/ci-cd.yml`:
```yaml
name: Auth App CI/CD Pipeline

on:
  push:
    branches: [ "**" ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    name: Run Typechecks and Unit Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Run Unit Tests
        run: npm run test:unit

  deploy:
    name: Deploy to Proxmox Docker
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Execute Remote Deployment via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.PROXMOX_DOCKER_HOST }}
          username: ${{ secrets.PROXMOX_SSH_USER }}
          key: ${{ secrets.PROXMOX_SSH_PRIVATE_KEY }}
          port: 22
          script: |
            cd /root/directus/auth-app
            git pull origin main
            docker compose build auth-app
            docker compose up -d --no-deps auth-app
            docker system prune -f
            curl -f https://auth.ymatt.online/healthz || exit 1
```

---

## 7. Future Capabilities Roadmap
- **Enterprise SAML 2.0 & Active Directory (Phase 6):** Integrate Okta or on-premise LDAP via Directus SSO drivers.
- **WebAuthn / Passkeys (Phase 7):** Directus extension allowing users to register FIDO2 passkeys for passwordless authentication.
- **Audit Logging & Geolocation Tracking (Phase 8):** Ingest login events from `directus_activity` to detect suspicious concurrent sessions and trigger alerts.
