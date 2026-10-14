# Proxmox LXC Production Deployment Guide

This guide details the setup for hosting **Aaaauutttooo AuthApp** on the **Proxmox Docker LXC** (`192.168.2.6`), routed securely via **Cloudflare Tunnel** (`auth.ymatt.online`), with automated CI/CD deployment on merge to `main`.

---

## 1. Homelab Host Architecture

- **Proxmox Host:** Dedicated Proxmox VE node
- **Docker LXC IP:** `192.168.2.6`
- **PostgreSQL LXC IP:** `192.168.2.5`
- **Application Directory on LXC:** `/root/directus/auth-app`
- **Public FQDN:** `https://auth.ymatt.online` (Cloudflare Tunnel)
- **Directus FQDN:** `https://directus.ymatt.online`

---

## 2. Server Setup on Proxmox LXC (`192.168.2.6`)

### Step 1: Clone the repository into `/root/directus/auth-app`
```bash
ssh root@192.168.2.6
cd /root/directus
git clone git@github.com:yarnitram/Aaaauutttooo.git auth-app
cd auth-app
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` inside `/root/directus/auth-app/`:
```bash
cp .env.example .env
```
Ensure `COOKIE_SECRET` and `DIRECTUS_ADMIN_TOKEN` are populated with secure production secrets.

### Step 3: Integrate with `/root/directus/docker-compose.yml`
Append the `auth-app` service definition from `deploy/docker-compose.directus.yml` to `/root/directus/docker-compose.yml`.

---

## 3. Cloudflare Tunnel Configuration

In Cloudflare Zero Trust (Access > Tunnels):
1. Locate the tunnel connected to the LXC host (`192.168.2.6`).
2. Add a Public Hostname:
   - **Subdomain:** `auth`
   - **Domain:** `ymatt.online`
   - **Type:** `HTTP`
   - **URL:** `localhost:3000` (or `192.168.2.6:3000`)
3. Additional Settings:
   - Enable `HTTP2` and set TLS verification if applicable.

---

## 4. GitHub Actions Repository Secrets

In your GitHub repository settings (`https://github.com/yarnitram/Aaaauutttooo/settings/secrets/actions`), add the following repository secrets:

| Secret Name | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `PROXMOX_DOCKER_HOST` | SSH host or Cloudflare SSH access domain / Tailscale IP | `192.168.2.6` or `ssh.ymatt.online` |
| `PROXMOX_SSH_USER` | SSH user with Docker permissions | `root` or `deploy` |
| `PROXMOX_SSH_PRIVATE_KEY` | Private SSH key (ed25519) authorized in `~/.ssh/authorized_keys` | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

---

## 5. Automated Rollout Pipeline

When code is merged into `main`:
1. GitHub Actions runner executes:
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:int`
   - `npm run build`
2. If all tests pass, the deploy job connects via SSH and executes:
   ```bash
   cd /root/directus/auth-app
   git pull origin main
   docker compose build auth-app
   docker compose up -d --no-deps auth-app
   docker system prune -f
   curl -f https://auth.ymatt.online/healthz || exit 1
   ```
3. Container restart is atomic with zero downtime for incoming client requests.
