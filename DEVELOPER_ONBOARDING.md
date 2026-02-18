# Developer Onboarding Guide

**Welcome to the Restaurant WhatsApp Bot Team!** 🎉

This guide will help you get up and running with the codebase in your first week.

---

## Table of Contents

1. [Day 1: Setup & Overview](#day-1-setup--overview)
2. [Day 2: Backend Deep Dive](#day-2-backend-deep-dive)
3. [Day 3: Frontend & Mobile](#day-3-frontend--mobile)
4. [Day 4: Testing & Deployment](#day-4-testing--deployment)
5. [Day 5: First Contribution](#day-5-first-contribution)
6. [Resources & Best Practices](#resources--best-practices)

---

## Day 1: Setup & Overview

### Prerequisites

Before you start, ensure you have:

- **Node.js** 18+ LTS installed
- **MongoDB** 6+ installed locally or access to cloud instance
- **Redis** 7+ installed locally
- **Git** configured with your credentials
- **VS Code** or your preferred IDE
- **Docker** & **Docker Compose** (optional but recommended)
- **Postman** or similar API testing tool

### 1.1 Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/restaurant-bot.git
cd restaurant-bot

# Check out the development branch
git checkout develop
```

### 1.2 Backend Setup

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Required: MONGODB_URI, REDIS_URL, JWT_SECRET, WHATSAPP_TOKEN, etc.
nano .env

# Run database migrations
npm run migrate:up

# Start development server
npm run dev
```

The backend should now be running on `https://restaruntbot.onrender.com`

### 1.3 Frontend Setup

```bash
# Navigate to frontend (in a new terminal)
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend should now be running on `https://restarunt-bot.vercel.app`

### 1.4 Mobile App Setup

```bash
# Navigate to mobile app
cd app

# Install dependencies
npm install

# Start Expo development server
npm start

# Scan QR code with Expo Go app on your phone
```

### 1.5 Verify Installation

```bash
# Test backend health
curl https://restaruntbot.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"..."}

# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

### 1.6 Docker Setup (Alternative)

```bash
# Start all services with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### 1.7 Project Structure Overview

```
restaurant-bot/
├── backend/              # Node.js + Express backend
│   ├── config/          # Configuration files
│   ├── middleware/      # Express middleware
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   │   ├── domains/    # Domain handlers (DDD)
│   │   └── ...         # Other services
│   ├── migrations/      # Database migrations
│   ├── __tests__/       # Test files
│   └── server.js        # Entry point
├── frontend/            # React + Vite frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # Custom hooks
│   │   ├── store/      # Zustand stores
│   │   └── api.js      # API client
│   └── vite.config.js  # Vite configuration
├── app/                 # React Native mobile app
│   ├── src/
│   │   ├── screens/    # Screen components
│   │   ├── navigation/ # Navigation setup
│   │   ├── context/    # React context
│   │   └── services/   # Mobile services
│   └── App.js          # Entry point
├── k8s/                 # Kubernetes manifests
├── loadtest/            # K6 load tests
└── docs/                # Documentation
```

### 1.8 Key Concepts

#### Architecture
- **Backend**: Domain-driven design with 6 domain handlers
- **Frontend**: Component-based with Zustand state management
- **Mobile**: React Native with Expo
- **Infrastructure**: Kubernetes with auto-scaling

#### Data Flow
1. Customer sends WhatsApp message
2. Meta Cloud API sends webhook to backend
3. Message added to Bull queue (Redis)
4. Chatbot orchestrator processes message
5. Domain handler executes business logic
6. Response sent back via WhatsApp API

#### Key Technologies
- **Backend**: Node.js, Express, MongoDB, Redis, Bull
- **Frontend**: React, Vite, Zustand, Tailwind CSS
- **Mobile**: React Native, Expo, Firebase
- **DevOps**: Docker, Kubernetes, GitHub Actions

### 1.9 Access & Credentials

Request access to:
- [ ] GitHub repository
- [ ] MongoDB Atlas cluster (production)
- [ ] Redis Cloud instance (production)
- [ ] WhatsApp Business API credentials
- [ ] Razorpay API keys
- [ ] Cloudinary account
- [ ] Slack workspace
- [ ] Sentry project
- [ ] Firebase project

### 1.10 Team Communication

- **Slack**: #dev-team (general), #dev-backend, #dev-frontend
- **Stand-ups**: Daily at 10:00 AM
- **Sprint Planning**: Every Monday at 2:00 PM
- **Code Reviews**: Required for all PRs
- **Documentation**: Update as you code

---

## Day 2: Backend Deep Dive

### 2.1 Understanding the Backend Architecture

#### Domain-Driven Design

The backend uses DDD with 6 domain handlers:

1. **Menu Handler** (`services/domains/menuHandler.js`)
   - Display menu items
   - Filter by category
   - Show item details

2. **Cart Handler** (`services/domains/cartHandler.js`)
   - Add items to cart
   - Update quantities
   - Remove items
   - View cart

3. **Order Handler** (`services/domains/orderHandler.js`)
   - Place orders
   - Track orders
   - Cancel orders
   - Order history

4. **Payment Handler** (`services/domains/paymentInitiationHandler.js`)
   - Generate payment links
   - Process payments
   - Handle refunds

5. **Location Handler** (`services/domains/locationHandler.js`)
   - Validate delivery address
   - Calculate delivery fee
   - Check delivery availability

6. **Error Handler** (`services/domains/errorHandler.js`)
   - Handle errors gracefully
   - Provide helpful messages
   - Log errors

#### Chatbot Orchestrator

The orchestrator (`services/chatbotOrchestrator.js`) is the brain:

```javascript
// Intent detection
const intent = detectIntent(message);

// Route to appropriate domain
switch (intent) {
  case 'MENU':
    return menuHandler.handle(message, customer);
  case 'CART':
    return cartHandler.handle(message, customer);
  case 'ORDER':
    return orderHandler.handle(message, customer);
  // ...
}
```

### 2.2 Key Services

#### WhatsApp Service (`services/whatsapp.js`)

```javascript
// Send text message
await whatsappService.sendMessage(phone, message);

// Send message with image
await whatsappService.sendMessageWithImage(phone, message, imageUrl);

// Send interactive buttons
await whatsappService.sendButtons(phone, message, buttons);
```

#### Cache Service (`services/cache.js`)

```javascript
// Get from cache
const menu = await cache.get('menu', 'all');

// Set cache with TTL
await cache.set('menu', 'all', menuData, 300); // 5 minutes

// Invalidate cache
await cache.invalidate('menu');
```

#### Circuit Breaker (`services/circuitBreaker.js`)

```javascript
// Wrap external API calls
const result = await circuitBreaker.execute(
  'whatsapp',
  () => whatsappAPI.sendMessage(data)
);
```

### 2.3 Database Models

#### Order Model (`models/Order.js`)

```javascript
const order = new Order({
  customer: customerId,
  items: [{ menuItem, quantity, price }],
  total: 500,
  status: 'pending',
  deliveryAddress: { ... },
  paymentStatus: 'pending'
});

await order.save();
```

#### Customer Model (`models/Customer.js`)

```javascript
const customer = await Customer.findOne({ phone });
customer.cart.push({ menuItem, quantity });
await customer.save();
```

### 2.4 API Endpoints

#### Authentication
```bash
POST /api/auth/login
POST /api/auth/register
POST /api/token/refresh
POST /api/token/revoke
```

#### Orders
```bash
GET    /api/orders              # List orders
GET    /api/orders/:id          # Get order details
POST   /api/orders              # Create order
PATCH  /api/orders/:id          # Update order
DELETE /api/orders/:id          # Cancel order
```

#### Menu
```bash
GET    /api/menu                # List menu items
GET    /api/menu/:id            # Get item details
POST   /api/menu                # Create item (admin)
PATCH  /api/menu/:id            # Update item (admin)
DELETE /api/menu/:id            # Delete item (admin)
```

### 2.5 Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- services/domains/menuHandler.test.js

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### 2.6 Debugging

#### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/server.js",
      "envFile": "${workspaceFolder}/backend/.env"
    }
  ]
}
```

#### Logging

```javascript
const logger = require('./services/logger');

logger.info('Order created', { orderId, customerId });
logger.error('Payment failed', { error, orderId });
logger.debug('Cache hit', { key, value });
```

---

## Day 3: Frontend & Mobile

### 3.1 Frontend Architecture

#### State Management (Zustand)

```javascript
// Using cart store
import { useCartStore } from './store/store';

function CartButton() {
  const items = useCartStore(state => state.items);
  const addItem = useCartStore(state => state.addItem);
  const total = useCartStore(state => state.total);
  
  return (
    <button onClick={() => addItem(item)}>
      Add to Cart ({items.length}) - ₹{total}
    </button>
  );
}
```

#### Form Validation

```javascript
import { useFormValidation, loginSchema } from './hooks/useForm';

function LoginForm() {
  const { register, handleSubmit, errors } = useFormValidation(loginSchema);
  
  const onSubmit = async (data) => {
    await api.post('/auth/login', data);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      
      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
      
      <button type="submit">Login</button>
    </form>
  );
}
```

#### Error Boundaries

```javascript
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

### 3.2 Mobile App Architecture

#### Navigation

```javascript
// Admin navigation
import { AdminTabs } from './navigation/AdminTabs';

// Delivery navigation
import { DeliveryTabs } from './navigation/DeliveryTabs';
```

#### Offline Support

```javascript
import { offlineStorage } from './services/offlineStorage';

// Save data offline
await offlineStorage.saveUserData(userData);

// Get cached data
const userData = await offlineStorage.getUserData();

// Queue offline action
await offlineStorage.queueOfflineAction('createOrder', orderData);
```

#### Push Notifications

```javascript
import { fcmNotifications } from './services/fcmNotifications';

// Request permissions
await fcmNotifications.requestPermissions();

// Get FCM token
const token = await fcmNotifications.getToken();

// Handle notifications
fcmNotifications.onNotification((notification) => {
  console.log('Received:', notification);
});
```

### 3.3 Styling

#### Tailwind CSS Classes

```jsx
// Common patterns
<div className="flex items-center justify-between gap-4">
<button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

#### Responsive Design

```jsx
// Mobile-first approach
<div className="w-full md:w-1/2 lg:w-1/3">
<div className="text-sm md:text-base lg:text-lg">
<div className="hidden md:block">
```

---

## Day 4: Testing & Deployment

### 4.1 Testing Strategy

#### Backend Tests (Jest)

```javascript
describe('Menu Handler', () => {
  it('should return menu items', async () => {
    const result = await menuHandler.handle('show menu', customer);
    expect(result.items).toHaveLength(10);
  });
  
  it('should filter by category', async () => {
    const result = await menuHandler.handle('show pizza', customer);
    expect(result.items.every(i => i.category === 'Pizza')).toBe(true);
  });
});
```

#### Frontend Tests (Vitest)

```javascript
import { render, screen } from '@testing-library/react';
import { CartButton } from './CartButton';

describe('CartButton', () => {
  it('renders cart count', () => {
    render(<CartButton />);
    expect(screen.getByText(/cart/i)).toBeInTheDocument();
  });
});
```

#### Integration Tests

```javascript
import request from 'supertest';
import app from '../server';

describe('POST /api/orders', () => {
  it('creates a new order', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [...], total: 500 });
    
    expect(response.status).toBe(201);
    expect(response.body.order).toHaveProperty('id');
  });
});
```

### 4.2 Git Workflow

#### Branch Strategy

```bash
# Main branches
main        # Production
develop     # Development
staging     # Staging

# Feature branches
feature/add-payment-gateway
feature/improve-menu-ui

# Bug fix branches
bugfix/fix-cart-calculation
hotfix/fix-payment-webhook
```

#### Commit Messages

```bash
# Format: <type>(<scope>): <subject>

feat(orders): add order cancellation feature
fix(cart): fix quantity update bug
docs(readme): update installation instructions
test(menu): add menu handler tests
refactor(auth): simplify JWT logic
```

#### Pull Request Process

1. Create feature branch from `develop`
2. Make changes and commit
3. Push branch and create PR
4. Request code review
5. Address review comments
6. Merge after approval

### 4.3 CI/CD Pipeline

#### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: npm run lint
```

#### Pre-commit Hooks

```bash
# Husky + lint-staged automatically runs:
- ESLint on JS/JSX files
- Prettier formatting
- Unit tests for changed files
```

### 4.4 Deployment

#### Development

```bash
# Deploy to development
git push origin develop

# Auto-deploys to dev environment
```

#### Staging

```bash
# Deploy to staging
git checkout staging
git merge develop
git push origin staging
```

#### Production

```bash
# Deploy to production (requires approval)
git checkout main
git merge staging
git tag v1.2.3
git push origin main --tags

# Kubernetes deployment
cd k8s
./deploy.sh production v1.2.3
```

---

## Day 5: First Contribution

### 5.1 Pick a Starter Task

Good first issues:
- [ ] Add a new menu category
- [ ] Improve error messages
- [ ] Add unit tests for a service
- [ ] Update documentation
- [ ] Fix a small bug

### 5.2 Development Workflow

```bash
# 1. Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# 2. Make changes
# ... code ...

# 3. Test your changes
npm test
npm run lint

# 4. Commit changes
git add .
git commit -m "feat(scope): description"

# 5. Push and create PR
git push origin feature/your-feature-name
# Create PR on GitHub

# 6. Address review comments
# ... make changes ...
git add .
git commit -m "fix: address review comments"
git push

# 7. Merge after approval
# Squash and merge on GitHub
```

### 5.3 Code Review Checklist

Before submitting PR:
- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Performance considered
- [ ] Security reviewed
- [ ] Backward compatible

### 5.4 Getting Help

- **Slack**: Ask in #dev-team or #dev-help
- **Documentation**: Check ARCHITECTURE.md, OPERATIONS_RUNBOOK.md
- **Code**: Look at similar implementations
- **Mentor**: Reach out to your assigned mentor
- **Stand-up**: Bring up blockers

---

## Resources & Best Practices

### Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) - Operations guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [API Documentation](https://restaruntbot.onrender.com/api-docs) - Swagger docs

### Code Style

#### JavaScript/Node.js
- Use ES6+ features
- Async/await over callbacks
- Destructuring where appropriate
- Arrow functions for short functions
- Meaningful variable names

```javascript
// Good
const { name, price } = menuItem;
const total = items.reduce((sum, item) => sum + item.price, 0);

// Bad
var x = menuItem.name;
var y = menuItem.price;
var total = 0;
for (var i = 0; i < items.length; i++) {
  total = total + items[i].price;
}
```

#### React
- Functional components with hooks
- Custom hooks for reusable logic
- PropTypes or TypeScript for type checking
- Meaningful component names

```javascript
// Good
function OrderCard({ order, onCancel }) {
  const [loading, setLoading] = useState(false);
  
  const handleCancel = async () => {
    setLoading(true);
    await onCancel(order.id);
    setLoading(false);
  };
  
  return <div>...</div>;
}

// Bad
function Card(props) {
  return <div>{props.data.name}</div>;
}
```

### Performance Tips

1. **Use caching**: Check cache before database
2. **Optimize queries**: Use indexes, lean(), select()
3. **Batch operations**: Use insertMany() instead of multiple insert()
4. **Lazy loading**: Load data on demand
5. **Code splitting**: Split vendor and app code

### Security Best Practices

1. **Never commit secrets**: Use .env files
2. **Validate input**: Use express-validator
3. **Sanitize output**: Prevent XSS
4. **Use HTTPS**: Always in production
5. **Rate limiting**: Prevent abuse
6. **Authentication**: JWT with refresh tokens
7. **Authorization**: Check user roles

### Common Pitfalls

1. **Not handling errors**: Always use try-catch
2. **Blocking operations**: Use async/await
3. **Memory leaks**: Clean up listeners
4. **N+1 queries**: Use populate() or aggregation
5. **Not testing**: Write tests as you code
6. **Hardcoding values**: Use config files

### Useful Commands

```bash
# Backend
npm run dev              # Start dev server
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run lint             # Lint code
npm run migrate:up       # Run migrations
npm run migrate:down     # Rollback migrations

# Frontend
npm run dev              # Start dev server
npm run build            # Production build
npm test                 # Run tests
npm run preview          # Preview build

# Mobile
npm start                # Start Expo
npm run android          # Run on Android
npm run ios              # Run on iOS

# Docker
docker-compose up        # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs

# Kubernetes
kubectl get pods         # List pods
kubectl logs <pod>       # View logs
kubectl describe pod     # Pod details
kubectl exec -it <pod>   # Shell into pod
```

---

## Welcome Aboard! 🚀

You're now ready to start contributing to the Restaurant WhatsApp Bot project. Remember:

- **Ask questions**: No question is too small
- **Read the code**: Best way to learn
- **Write tests**: They save time later
- **Document**: Help future developers
- **Have fun**: Enjoy the journey!

**Need help?** Reach out to your mentor or ask in #dev-team on Slack.

**Happy coding!** 💻

---

**Document Version:** 1.0.0
**Last Updated:** February 5, 2026
**Maintained By:** Development Team
