# Aaaauutttooo (AuthApp)

> Directus-Powered Headless Authentication BFF and API Gateway.

## Overview
A high-performance Node.js / Fastify service acting as a Backend-For-Frontend (BFF) and API Gateway. Backed by **Directus 11+** running on Proxmox LXC (`192.168.2.6`) and PostgreSQL 16 (`192.168.2.5`), publicly routed via Cloudflare Tunnel (`auth.ymatt.online`).

## Features
- **Directus As Identity Provider:** Uses native `directus_users` and RBAC (`Member`, `Service Accounts`).
- **Encrypted HttpOnly Sessions:** Manages client cookies securely while proxying Directus tokens.
- **OpenAPI / Swagger UI:** Interactive documentation at `/documentation`.
- **Vitest Unit & Integration Tests:** Fast in-memory tests with `@directus/sdk` mocks and `server.inject`.
- **Automated Proxmox Deployment:** GitHub Actions pipeline triggering zero-downtime Docker rollout on merge to `main`.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Seed Directus Roles (Optional/Initial Setup)
```bash
npm run seed
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Run Test Suite
```bash
npm run test:unit
npm run test:int
```
