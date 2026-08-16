# DLM Backend - Distributed Logistics API

![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![Kafka](https://img.shields.io/badge/Kafka-7.4-black)

This is the standalone **Express + TypeScript Backend Repository** for the Distributed Logistics & Warehouse Management System (DLM).

---

## ⚙️ Production Architecture & CI/CD Pipeline

```text
Push to production branch (or workflow_dispatch)
      ↓
npm ci
      ↓
npm test
      ↓
npm run build
      ↓
Build Docker image (tagged latest & SHA)
      ↓
Push SHA-tagged image to GHCR (ghcr.io)
      ↓
SSH to VPS (/opt/dlm-backend)
      ↓
Pull exact SHA image
      ↓
Deploy via Docker Compose (--no-build --force-recreate)
      ↓
Health check (PRODUCTION_HEALTH_URL)
      │
      ├── PASS → Deployment Successful ✅ & Image Pruning
      │
      └── FAIL → Automatic Rollback to previous container image & Workflow Exit 1 ❌
```

---

## 🔒 Required GitHub Repository Secrets

Configure the following secrets in GitHub Repository Settings -> **Secrets and variables** -> **Actions**:

| Secret Name | Description | Example / Usage |
| :--- | :--- | :--- |
| `SSH_HOST` | Production VPS IP address or domain | `192.0.2.1` / `api.dlm.com` |
| `SSH_USER` | SSH user on production VPS | `root` / `ubuntu` |
| `SSH_KEY` | Private SSH key for production VPS | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| `GHCR_USERNAME` | Production GitHub / GHCR username | `your-github-username` |
| `GHCR_TOKEN` | Production-scoped Personal Access Token (read:packages) | `ghp_xxxxxxxxxxxx` |
| `PRODUCTION_HEALTH_URL` | Live URL for automated health verification | `https://api.dlm.com/api/v1/public/health` |

---

## 📂 Expected Production Server Directory Setup

On your production VPS server:

```bash
# Strict production directory
/opt/dlm-backend/
├── docker-compose.yml
└── .env
```

### Production `docker-compose.yml` Template (`/opt/dlm-backend/docker-compose.yml`):

```yaml
version: '3.8'

services:
  backend:
    image: ghcr.io/your-github-username/dlm-backend:${IMAGE_TAG:-latest}
    container_name: dlm-backend-service
    restart: always
    ports:
      - "5000:5000"
    environment:
      PORT: 5000
      NODE_ENV: production
      PGHOST: localhost
      PGPORT: 5432
      PGUSER: postgres
      PGPASSWORD: teja512
      PGDATABASE: dml
      JWT_SECRET: dlm_super_secret_jwt_key_2026_production_ready
```

---

## 🚀 Running Locally

```bash
npm install
npm run db:init     # Provisions dml database tables
npm run db:seed     # Seeds initial demo records
npm run dev         # Starts backend dev server on http://localhost:5000
```

### Trigger Production Sync & Deploy
```bash
npm run live        # Syncs main branch to production branch and triggers GitHub Actions CI/CD
```
