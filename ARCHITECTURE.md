# System Architecture Documentation

**Project:** Restaurant WhatsApp Bot (Full Stack)
**Version:** 1.0.0
**Last Updated:** February 5, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [Component Details](#component-details)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Design Patterns](#design-patterns)
7. [Scalability & Performance](#scalability--performance)
8. [Security Architecture](#security-architecture)

---

## System Overview

The Restaurant WhatsApp Bot is a full-stack enterprise application that enables customers to order food via WhatsApp, with comprehensive admin and delivery management interfaces.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
├─────────────┬─────────────────┬──────────────────┬──────────────┤
│  Customers  │  Admin Users    │  Delivery Boys   │  Web Users   │
│  (WhatsApp) │  (Mobile App)   │  (Mobile App)    │  (Browser)   │
└──────┬──────┴────────┬────────┴────────┬─────────┴──────┬───────┘
       │               │                 │                │
       │               │                 │                │
┌──────▼───────────────▼─────────────────▼────────────────▼───────┐
│                    LOAD BALANCER (NGINX)                         │
│                    SSL/TLS Termination                           │
│                    Rate Limiting (100 RPS)                       │
└──────┬───────────────┬─────────────────┬────────────────┬───────┘
       │               │                 │                │
┌──────▼──────┐ ┌─────▼──────┐ ┌────────▼────────┐ ┌────▼────────┐
│   Backend   │ │  Backend   │ │    Backend      │ │   Frontend  │
│   Pod 1     │ │   Pod 2    │ │    Pod 3        │ │   (React)   │
│  (Node.js)  │ │ (Node.js)  │ │   (Node.js)     │ │   (Vite)    │
└──────┬──────┘ └─────┬──────┘ └────────┬────────┘ └─────────────┘
       │               │                 │
       └───────────────┴─────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│   MongoDB   │ │   Redis    │ │  External  │
│  (Primary)  │ │  (Cache +  │ │    APIs    │
│             │ │   Queue)   │ │            │
└─────────────┘ └────────────┘ └────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────▼────┐ ┌───▼────┐ ┌───▼────────┐
              │ WhatsApp │ │Razorpay│ │  Cloudinary│
              │   API    │ │  API   │ │    API     │
              └──────────┘ └────────┘ └────────────┘
```

---

## Architecture Diagrams

### 1. System Context Diagram (C4 Level 1)

```
                    ┌─────────────────────┐
                    │   Restaurant Bot    │
                    │   System            │
                    └──────────┬──────────┘
                               │
        ┏━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━┓
        ┃                                              ┃
┌───────▼────────┐  ┌──────────────┐  ┌──────────────▼────────┐
│   Customers    │  │    Admins    │  │   Delivery Partners   │
│  (WhatsApp)    │  │ (Mobile App) │  │    (Mobile App)       │
└───────┬────────┘  └──────┬───────┘  └──────────┬────────────┘
        │                  │                      │
        │                  │                      │
        └──────────────────┼──────────────────────┘
                           │
                ┌──────────▼──────────┐
                │  Restaurant Bot     │
                │  Backend System     │
                │  (Node.js + React)  │
                └──────────┬──────────┘
                           │
        ┏━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━┓
        ┃                                      ┃
┌───────▼────────┐  ┌──────────────┐  ┌──────▼──────────┐
│  WhatsApp API  │  │ Razorpay API │  │ Cloudinary API  │
│  (Meta Cloud)  │  │  (Payments)  │  │    (Images)     │
└────────────────┘  └──────────────┘  └─────────────────┘
```

### 2. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Restaurant Bot System                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │  Web Frontend  │  │  Admin Mobile  │  │ Delivery Mobile │  │
│  │   (React +     │  │  (React Native)│  │ (React Native)  │  │
│  │    Vite)       │  │                │  │                 │  │
│  └────────┬───────┘  └────────┬───────┘  └────────┬────────┘  │
│           │                   │                    │            │
│           └───────────────────┼────────────────────┘            │
│                               │                                 │
│  ┌────────────────────────────▼──────────────────────────────┐ │
│  │              Backend API (Node.js + Express)              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │  Auth    │  │  Orders  │  │  Menu    │  │ Delivery │ │ │
│  │  │ Service  │  │ Service  │  │ Service  │  │ Service  │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │ Chatbot  │  │ Payment  │  │  Webhook │  │  Cache   │ │ │
│  │  │Orchestr. │  │ Service  │  │ Handler  │  │ Service  │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│  └────────────────────────────┬──────────────────────────────┘ │
│                                │                                │
│  ┌────────────────────────────▼──────────────────────────────┐ │
│  │                    Data Layer                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │ MongoDB  │  │  Redis   │  │  Bull    │  │  Logger  │ │ │
│  │  │(Database)│  │ (Cache)  │  │ (Queue)  │  │ (Winston)│ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Component Diagram - Backend (C4 Level 3)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Application                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   API Layer (Express)                     │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │  │
│  │  │ Auth   │ │Orders  │ │ Menu   │ │Delivery│ │Webhook │ │  │
│  │  │ Routes │ │ Routes │ │ Routes │ │ Routes │ │ Routes │ │  │
│  │  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ │  │
│  └──────┼──────────┼──────────┼──────────┼──────────┼──────┘  │
│         │          │          │          │          │          │
│  ┌──────▼──────────▼──────────▼──────────▼──────────▼──────┐  │
│  │                  Middleware Layer                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │   Auth   │ │   Rate   │ │  Input   │ │  Error   │   │  │
│  │  │Middleware│ │ Limiter  │ │Validator │ │ Handler  │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │                   Service Layer                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   Chatbot    │  │   Payment    │  │   WhatsApp   │  │  │
│  │  │ Orchestrator │  │   Service    │  │   Service    │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                  │                  │          │  │
│  │  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  │  │
│  │  │   Domain     │  │   Circuit    │  │    Cache     │  │  │
│  │  │   Handlers   │  │   Breaker    │  │   Service    │  │  │
│  │  │  (6 domains) │  │   Service    │  │              │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  └─────────┼──────────────────┼──────────────────┼─────────┘  │
│            │                  │                  │             │
│  ┌─────────▼──────────────────▼──────────────────▼─────────┐  │
│  │                    Data Access Layer                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ Mongoose │  │  Redis   │  │   Bull   │  │ Winston │ │  │
│  │  │  Models  │  │  Client  │  │  Queue   │  │ Logger  │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │  │
│  └───────┼─────────────┼─────────────┼─────────────┼───────┘  │
│          │             │             │             │           │
└──────────┼─────────────┼─────────────┼─────────────┼───────────┘
           │             │             │             │
    ┌──────▼──────┐ ┌───▼────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │   MongoDB   │ │ Redis  │ │   Redis   │ │   Files   │
    │  (Primary)  │ │(Cache) │ │  (Queue)  │ │  (Logs)   │
    └─────────────┘ └────────┘ └───────────┘ └───────────┘
```

### 4. Deployment Architecture (Kubernetes)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Ingress Controller (NGINX)                   │  │
│  │  - SSL/TLS Termination (Let's Encrypt)                    │  │
│  │  - Load Balancing (Round Robin)                           │  │
│  │  - Rate Limiting (100 RPS)                                │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                          │
│         ┌─────────────┼─────────────┐                           │
│         │             │             │                           │
│  ┌──────▼──────┐ ┌───▼──────┐ ┌───▼──────┐                    │
│  │  Backend    │ │ Backend  │ │ Backend  │                    │
│  │   Pod 1     │ │  Pod 2   │ │  Pod 3   │                    │
│  │  (Node.js)  │ │(Node.js) │ │(Node.js) │                    │
│  │  ┌────────┐ │ │┌────────┐│ │┌────────┐│                    │
│  │  │ 512MB  │ │ ││ 512MB  ││ ││ 512MB  ││                    │
│  │  │ 0.5CPU │ │ ││ 0.5CPU ││ ││ 0.5CPU ││                    │
│  │  └────────┘ │ │└────────┘│ │└────────┘│                    │
│  └──────┬──────┘ └───┬──────┘ └───┬──────┘                    │
│         │            │            │                             │
│         └────────────┼────────────┘                             │
│                      │                                          │
│  ┌───────────────────┼───────────────────┐                     │
│  │  Horizontal Pod Autoscaler (HPA)      │                     │
│  │  - Min: 3 pods, Max: 10 pods          │                     │
│  │  - CPU: 70%, Memory: 80%              │                     │
│  └───────────────────────────────────────┘                     │
│                      │                                          │
│         ┌────────────┼────────────┐                            │
│         │            │            │                            │
│  ┌──────▼──────┐ ┌──▼────────┐ ┌─▼──────────┐                 │
│  │  MongoDB    │ │   Redis   │ │  Frontend  │                 │
│  │  StatefulSet│ │StatefulSet│ │ Deployment │                 │
│  │  ┌────────┐ │ │┌────────┐ │ │ ┌────────┐ │                 │
│  │  │  20Gi  │ │ ││  5Gi   │ │ │ │ 2 Pods │ │                 │
│  │  │  PVC   │ │ ││  PVC   │ │ │ │(Nginx) │ │                 │
│  │  └────────┘ │ │└────────┘ │ │ └────────┘ │                 │
│  └─────────────┘ └───────────┘ └────────────┘                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Network Policies                             │  │
│  │  - Backend → MongoDB, Redis (allowed)                     │  │
│  │  - Frontend → Backend (allowed)                           │  │
│  │  - Ingress → Backend, Frontend (allowed)                  │  │
│  │  - All other traffic (denied)                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Data Flow Diagram - Order Processing

```
┌──────────┐
│ Customer │
│(WhatsApp)│
└────┬─────┘
     │ 1. Send message
     │    "I want pizza"
     ▼
┌────────────────┐
│  WhatsApp API  │
│  (Meta Cloud)  │
└────┬───────────┘
     │ 2. Webhook POST
     │    /api/webhook
     ▼
┌────────────────────┐
│  Webhook Handler   │
│  - Verify signature│
│  - Add to queue    │
└────┬───────────────┘
     │ 3. Queue message
     ▼
┌────────────────────┐
│   Bull Queue       │
│   (Redis-backed)   │
└────┬───────────────┘
     │ 4. Process message
     ▼
┌────────────────────┐
│ Chatbot            │
│ Orchestrator       │
│ - Intent detection │
│ - Route to domain  │
└────┬───────────────┘
     │ 5. Route to domain
     ▼
┌────────────────────┐
│  Menu Handler      │
│  - Show menu       │
│  - Add to cart     │
└────┬───────────────┘
     │ 6. Query database
     ▼
┌────────────────────┐      ┌────────────────┐
│    MongoDB         │◄─────┤  Redis Cache   │
│  - Menu items      │      │  - Menu cached │
│  - Categories      │      │  - 5 min TTL   │
└────┬───────────────┘      └────────────────┘
     │ 7. Return menu
     ▼
┌────────────────────┐
│  WhatsApp Service  │
│  - Format message  │
│  - Send via API    │
└────┬───────────────┘
     │ 8. Send message
     ▼
┌────────────────────┐
│  WhatsApp API      │
│  (Meta Cloud)      │
└────┬───────────────┘
     │ 9. Deliver message
     ▼
┌──────────┐
│ Customer │
│(WhatsApp)│
└──────────┘
```

---

## Component Details

### Backend Components

#### 1. API Layer
- **Express.js** REST API server
- **Routes**: Auth, Orders, Menu, Delivery, Webhook, Admin
- **Middleware**: Authentication, Rate Limiting, Input Validation, Error Handling
- **Health Checks**: 5 endpoints for monitoring

#### 2. Service Layer
- **Chatbot Orchestrator**: Intent detection and routing
- **Domain Handlers**: 6 specialized handlers (Menu, Cart, Order, Payment, Location, Error)
- **WhatsApp Service**: Message sending and formatting
- **Payment Service**: Razorpay integration
- **Circuit Breaker**: Fault tolerance for external APIs
- **Cache Service**: Redis-based caching

#### 3. Data Layer
- **MongoDB**: Primary database (orders, menu, users, customers)
- **Redis**: Caching and message queue
- **Bull Queue**: Async job processing
- **Winston Logger**: Structured logging with rotation

### Frontend Components

#### 1. Web Application (React + Vite)
- **Pages**: Home, Menu, Offers, About, Contact, Admin Dashboard
- **State Management**: Zustand (6 stores)
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Animations**: GSAP

#### 2. Mobile Applications (React Native + Expo)
- **Admin App**: Order management, menu management, reports
- **Delivery App**: Order tracking, delivery management
- **Offline Support**: AsyncStorage
- **Push Notifications**: FCM
- **Analytics**: Firebase Analytics
- **Crash Reporting**: Sentry

---

## Data Flow

### 1. Customer Order Flow

```
Customer → WhatsApp → Webhook → Queue → Orchestrator → Domain Handler
                                                              ↓
                                                         MongoDB
                                                              ↓
                                                    WhatsApp Response
```

### 2. Admin Order Management Flow

```
Admin App → Backend API → MongoDB → Real-time Update → Push Notification
                                                              ↓
                                                      Delivery App
```

### 3. Payment Flow

```
Customer → Order Confirmation → Razorpay Link → Payment → Webhook
                                                              ↓
                                                    Update Order Status
                                                              ↓
                                                    Notify Customer
```

---

## Technology Stack

### Backend
- **Runtime**: Node.js 18 LTS
- **Framework**: Express.js 4.x
- **Database**: MongoDB 6.x with Mongoose ODM
- **Cache/Queue**: Redis 7.x with Bull
- **Authentication**: JWT with refresh tokens
- **Validation**: Express-validator + Zod
- **Testing**: Jest + Supertest
- **Logging**: Winston with daily rotation
- **Monitoring**: Custom metrics with Redis

### Frontend
- **Framework**: React 18.x
- **Build Tool**: Vite 5.x
- **State Management**: Zustand with Immer
- **Routing**: React Router v6
- **Styling**: Tailwind CSS 3.x
- **Forms**: React Hook Form + Zod
- **Testing**: Vitest + React Testing Library
- **Animations**: GSAP

### Mobile
- **Framework**: React Native with Expo
- **Navigation**: React Navigation
- **State**: React Context + AsyncStorage
- **Notifications**: Firebase Cloud Messaging
- **Analytics**: Firebase Analytics
- **Crash Reporting**: Sentry

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **Load Balancer**: NGINX Ingress
- **Auto-scaling**: Horizontal Pod Autoscaler
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana (optional)

---

## Design Patterns

### 1. Domain-Driven Design (DDD)
- Separate domain handlers for each business capability
- Clear boundaries between domains
- Shared utilities for common operations

### 2. Circuit Breaker Pattern
- Fault tolerance for external API calls
- Automatic failure detection and recovery
- Fallback strategies

### 3. Cache-Aside Pattern
- Check cache before database
- Populate cache on miss
- TTL-based expiration

### 4. Message Queue Pattern
- Async processing with Bull
- Retry with exponential backoff
- Zero message loss

### 5. Repository Pattern
- Mongoose models as repositories
- Abstraction over data access
- Query optimization

### 6. Middleware Pattern
- Request/response pipeline
- Cross-cutting concerns (auth, logging, validation)
- Composable middleware

---

## Scalability & Performance

### Horizontal Scaling
- **Backend**: 3-10 pods with HPA
- **Frontend**: 2-6 pods with HPA
- **Database**: Replica sets (future)
- **Cache**: Redis cluster (future)

### Performance Optimizations
- **Caching**: Redis with 5min-1hour TTL
- **Query Optimization**: Indexes, lean queries, aggregation
- **CDN**: Static assets served via CDN
- **Code Splitting**: Vendor chunks separated
- **Compression**: Gzip/Brotli for responses

### Load Handling
- **Rate Limiting**: 100 RPS per IP
- **Connection Pooling**: 10 max, 2 min
- **Queue**: Bull for async processing
- **Circuit Breaker**: Prevent cascade failures

---

## Security Architecture

### Authentication & Authorization
- **JWT**: Access tokens (15min) + Refresh tokens (7 days)
- **Token Rotation**: Automatic on refresh
- **Token Blacklisting**: Revoked tokens stored in Redis
- **Role-Based Access**: Admin, Delivery, Customer roles

### Input Validation
- **Express-validator**: Server-side validation
- **Zod**: Type-safe validation schemas
- **Sanitization**: XSS prevention

### Network Security
- **HTTPS**: SSL/TLS encryption
- **CORS**: Origin validation
- **Helmet.js**: Security headers
- **Rate Limiting**: DDoS protection
- **Network Policies**: Pod-to-pod isolation in K8s

### Data Security
- **Password Hashing**: bcrypt with salt
- **Webhook Verification**: HMAC signature validation
- **Environment Variables**: Secrets management
- **Database**: Connection encryption

---

## Monitoring & Observability

### Logging
- **Winston**: Structured logging
- **Daily Rotation**: 14-day retention
- **Log Levels**: Error, Warn, Info, Debug
- **Correlation IDs**: Request tracing

### Metrics
- **Redis-based**: Persistent metrics
- **Request Counters**: Total, success, error
- **Response Times**: p50, p95, p99
- **Business Metrics**: Orders, revenue, users

### Alerting
- **Slack**: Critical errors
- **Email**: Error summaries
- **Thresholds**: Configurable alerts

### Health Checks
- **Liveness**: /health/live
- **Readiness**: /health/ready
- **Detailed**: /health/detailed

---

## Future Enhancements

### Phase 1 (Q2 2026)
- Database read replicas
- Redis cluster
- Advanced monitoring (Prometheus + Grafana)
- APM integration

### Phase 2 (Q3 2026)
- Multi-region deployment
- Event sourcing
- CQRS pattern
- GraphQL API

### Phase 3 (Q4 2026)
- Machine learning recommendations
- Advanced analytics
- A/B testing framework
- Progressive web app (PWA)

---

**Document Version:** 1.0.0
**Last Updated:** February 5, 2026
**Maintained By:** Development Team
