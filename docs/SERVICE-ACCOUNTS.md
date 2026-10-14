# Service Accounts & Homelab Automation Guide

This guide documents the configuration and integration patterns for **Hermes AI** (`192.168.2.7`) and **n8n Automation** (`192.168.2.6`) interacting with the **Aaaauutttooo AuthApp** and **Directus 11+** without cookie state.

---

## 1. Overview & Architecture

Static Service Accounts exist in `directus_users` with the dedicated role `Service Accounts`. Their tokens are stored in `directus_users.token` and never expire, enabling seamless service-to-service communication.

```
┌────────────────────────┐         ┌────────────────────────┐
│     Hermes AI Agent    │         │     n8n Automation     │
│      192.168.2.7       │         │      192.168.2.6       │
└───────────┬────────────┘         └───────────┬────────────┘
            │                                  │
            │ Bearer Static Token              │ Bearer Static Token
            ▼                                  ▼
┌───────────────────────────────────────────────────────────┐
│               Fastify BFF Gateway (AuthApp)               │
│               https://auth.ymatt.online                   │
│                                                           │
│  - /api/webhooks/receiver                                 │
│  - /api/webhooks/hermes                                   │
│  - /api/webhooks/n8n                                      │
│  - /api/data/:collection                                  │
└───────────────────────────┬───────────────────────────────┘
                            │
               Bearer Token │ Directus Rest Query
                            ▼
┌───────────────────────────────────────────────────────────┐
│                      Directus 11+                         │
│             https://directus.ymatt.online                 │
│              Role: [Service Accounts]                     │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Automated Provisioning (`npm run seed`)

Run the following command to provision or verify the `Service Accounts` role and accounts:

```bash
npm run seed
```

This ensures:
1. Role `Service Accounts` exists.
2. User `hermes-agent@ymatt.online` exists with a 64-character static token.
3. User `n8n-automation@ymatt.online` exists with a 64-character static token.

---

## 3. Webhook Receiver Integration Examples

### Hermes AI Webhook (`POST /api/webhooks/hermes`)
```bash
curl -X POST https://auth.ymatt.online/api/webhooks/hermes \
  -H "Authorization: Bearer <HERMES_STATIC_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ai.agent.completed",
    "prompt": "Summarize market alerts",
    "status": "success",
    "result": { "count": 12 }
  }'
```

### n8n Automation Webhook (`POST /api/webhooks/n8n`)
```bash
curl -X POST https://auth.ymatt.online/api/webhooks/n8n \
  -H "Authorization: Bearer <N8N_STATIC_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "cron.nightly_backup",
    "workflow": "Backup Routine",
    "executed_at": "2026-10-14T03:00:00Z"
  }'
```

---

## 4. Stateless Directus Collection Access (`/api/data/:collection`)

Service accounts can read and write collections directly without cookies:

### Read from Collection:
```bash
curl -X GET "https://auth.ymatt.online/api/data/articles?limit=5" \
  -H "Authorization: Bearer <STATIC_TOKEN>"
```

### Write to Collection:
```bash
curl -X POST "https://auth.ymatt.online/api/data/articles" \
  -H "Authorization: Bearer <STATIC_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Automated AI Report",
    "status": "published"
  }'
```
