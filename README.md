# Restaurant WhatsApp Bot

A full-stack enterprise application that enables customers to order food via WhatsApp, with comprehensive admin and delivery management interfaces.

## Architecture

```
Customers (WhatsApp) ──┐
Admin (Mobile App) ────┤
Delivery (Mobile App) ─┼──▶ NGINX (LB) ──▶ Node.js Backend ──▶ MongoDB / Redis
Web Users (Browser) ───┘                  ──▶ React Frontend
```

## Tech Stack

| Layer       | Technology                                      |
| ----------- | ----------------------------------------------- |
| Backend     | Node.js, Express, Mongoose, Bull, Winston       |
| Frontend    | React 18, Vite, Tailwind CSS, Zustand           |
| Mobile App  | React Native (Expo), React Navigation           |
| Database    | MongoDB 6.0, Redis                              |
| AI          | Groq SDK                                        |
| Payments    | Razorpay                                        |
| Messaging   | Meta WhatsApp Business API                      |
| Media       | Cloudinary                                      |
| Infra       | Docker, Kubernetes, NGINX                       |

## Prerequisites

- **Node.js** v18.x+
- **MongoDB** v6.0+
- **Docker** v20.x+ & Docker Compose v2.x+
- **Git**

### Required API Keys / Accounts

- Meta WhatsApp Business API
- Razorpay (payments)
- Cloudinary (image hosting)
- Google Cloud (Sheets API)
- Groq (AI features)

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd RestaruntBot-security
```

### 2. Environment variables

Copy the example `.env` files and fill in your credentials for each service:

```bash
cp backend/.env.example backend/.env
```

### 3. Run with Docker Compose (recommended)

```bash
docker-compose up --build
```

This starts MongoDB, the backend API (port **5000**), and the frontend.

### 4. Run locally (without Docker)

**Backend:**

```bash
cd backend
npm install
npm run dev
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**Mobile App:**

```bash
cd app
npm install
npm start
```

## Project Structure

```
├── app/             # React Native (Expo) mobile app
├── backend/         # Node.js / Express API server
├── frontend/        # React (Vite) admin dashboard
├── k8s/             # Kubernetes manifests
├── loadtest/        # k6 load testing scripts
├── docker-compose.yml
├── ARCHITECTURE.md
├── DEPLOYMENT.md
├── OPERATIONS_RUNBOOK.md
└── DEVELOPER_ONBOARDING.md
```

## Scripts

| Service  | Command              | Description               |
| -------- | -------------------- | ------------------------- |
| Backend  | `npm run dev`        | Start with hot-reload     |
| Backend  | `npm test`           | Run tests                 |
| Backend  | `npm run test:coverage` | Tests with coverage    |
| Frontend | `npm run dev`        | Vite dev server           |
| Frontend | `npm run build`      | Production build          |
| Frontend | `npm test`           | Run Vitest                |
| App      | `npm start`          | Expo dev server           |
| App      | `npm run android`    | Run on Android            |

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Operations Runbook](OPERATIONS_RUNBOOK.md)
- [Developer Onboarding](DEVELOPER_ONBOARDING.md)

## License

This project is proprietary. All rights reserved.
