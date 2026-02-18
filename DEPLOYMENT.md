# Deployment Guide
**Restaurant WhatsApp Bot - Full Stack Application**

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Production Deployment](#production-deployment)
6. [Database Backup & Restore](#database-backup--restore)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js**: v18.x or higher
- **MongoDB**: v6.0 or higher
- **Docker**: v20.x or higher (for containerized deployment)
- **Docker Compose**: v2.x or higher
- **Git**: Latest version

### Required Accounts & API Keys
- Meta WhatsApp Business API credentials
- Razorpay account (for payments)
- Cloudinary account (for image hosting)
- Google Cloud account (for Sheets API)
- Groq API key (for AI features)

---

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd RestaruntBot-main
```

### 2. Backend Environment Variables
Create `backend/.env` file:

```env
# Server
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/restaurant

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters

# Meta WhatsApp API
META_PHONE_NUMBER_ID=your-phone-number-id
META_ACCESS_TOKEN=your-access-token
META_BUSINESS_ID=your-business-id
META_APP_SECRET=your-app-secret
META_VERIFY_TOKEN=your-verify-token

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Google Sheets
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id

# Groq AI
GROQ_API_KEY=gsk_xxxxx

# CORS
ALLOWED_ORIGINS=https://restarunt-bot.vercel.app

# Optional
LOG_LEVEL=info
```

### 3. Frontend Environment Variables
Create `frontend/.env` file:

```env
VITE_API_URL=https://restaruntbot.onrender.com/api
```

---

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
```

Backend will run on `https://restaruntbot.onrender.com`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend will run on `https://restarunt-bot.vercel.app`

### Mobile App
```bash
cd app
npm install
npm start
```

---

## Docker Deployment

### 1. Using Docker Compose (Recommended for Development)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

**Services:**
- Backend: `https://restaruntbot.onrender.com`
- Frontend: `https://restarunt-bot.vercel.app`
- MongoDB: Atlas Cloud
- Redis: Redis Cloud

### 2. Individual Docker Containers

**Backend:**
```bash
cd backend
docker build -t restaurant-backend .
docker run -p 5000:5000 --env-file .env restaurant-backend
```

**Frontend:**
```bash
cd frontend
docker build -t restaurant-frontend .
docker run -p 80:80 restaurant-frontend
```

---

## Production Deployment

### Option 1: VPS/Cloud Server (DigitalOcean, AWS EC2, etc.)

#### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2 (Process Manager)
sudo npm install -g pm2
```

#### 2. Deploy Backend
```bash
cd backend
npm install --production
pm2 start server.js --name restaurant-backend
pm2 save
pm2 startup
```

#### 3. Deploy Frontend
```bash
cd frontend
npm install
npm run build

# Serve with nginx
sudo apt install nginx
sudo cp dist/* /var/www/html/
sudo systemctl restart nginx
```

#### 4. Setup SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Option 2: Docker on Production Server

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Option 3: Kubernetes

See `k8s/` directory for Kubernetes manifests (to be created).

---

## Database Backup & Restore

### Backup MongoDB

```bash
# Create backup
mongodump --uri="mongodb://localhost:27017/restaurant" --out=/backup/$(date +%Y%m%d)

# Automated daily backup (crontab)
0 2 * * * mongodump --uri="mongodb://localhost:27017/restaurant" --out=/backup/$(date +\%Y\%m\%d)
```

### Restore MongoDB

```bash
# Restore from backup
mongorestore --uri="mongodb://localhost:27017/restaurant" /backup/20260205
```

### Backup Strategy
- **Daily**: Automated backups at 2 AM
- **Retention**: Keep last 30 days
- **Storage**: Store backups in S3/Cloud Storage
- **Testing**: Test restore monthly

---

## Monitoring & Health Checks

### Health Check Endpoints

```bash
# Basic health
curl https://restaruntbot.onrender.com/health

# Readiness check (for K8s)
curl https://restaruntbot.onrender.com/health/ready

# Liveness check (for K8s)
curl https://restaruntbot.onrender.com/health/live

# Detailed health with metrics
curl https://restaruntbot.onrender.com/health/detailed

# Metrics
curl https://restaruntbot.onrender.com/api/metrics -H "Authorization: Bearer <token>"
```

### PM2 Monitoring

```bash
# View status
pm2 status

# View logs
pm2 logs restaurant-backend

# Monitor resources
pm2 monit

# Restart
pm2 restart restaurant-backend

# Stop
pm2 stop restaurant-backend
```

### Docker Monitoring

```bash
# View container status
docker ps

# View logs
docker logs restaurant-backend -f

# View resource usage
docker stats

# Health check
docker inspect --format='{{.State.Health.Status}}' restaurant-backend
```

---

## Troubleshooting

### Backend Won't Start

**Check logs:**
```bash
pm2 logs restaurant-backend
# or
docker logs restaurant-backend
```

**Common issues:**
1. **MongoDB not running**: `sudo systemctl start mongod`
2. **Port already in use**: `lsof -i :5000` and kill process
3. **Environment variables missing**: Check `.env` file
4. **Node modules**: `rm -rf node_modules && npm install`

### Database Connection Issues

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check connection
mongosh mongodb://localhost:27017/restaurant

# Check logs
sudo tail -f /var/log/mongodb/mongod.log
```

### High Memory Usage

```bash
# Check memory
free -h

# Restart services
pm2 restart all

# Clear logs
pm2 flush
```

### WhatsApp Webhook Not Receiving Messages

1. **Verify webhook URL**: Must be HTTPS in production
2. **Check webhook verification**: Ensure `META_VERIFY_TOKEN` matches
3. **Check signature verification**: Ensure `META_APP_SECRET` is correct
4. **Check logs**: Look for webhook errors

### Performance Issues

```bash
# Check system resources
htop

# Check database performance
mongosh
> db.currentOp()
> db.serverStatus()

# Check slow queries
> db.setProfilingLevel(2)
> db.system.profile.find().sort({ts:-1}).limit(5)
```

---

## Rollback Procedure

### Quick Rollback

```bash
# Using PM2
pm2 stop restaurant-backend
cd backend
git checkout <previous-commit>
npm install
pm2 restart restaurant-backend

# Using Docker
docker-compose down
git checkout <previous-commit>
docker-compose up -d --build
```

### Database Rollback

```bash
# Restore from backup
mongorestore --uri="mongodb://localhost:27017/restaurant" --drop /backup/<date>
```

---

## Security Checklist

- [ ] All environment variables set correctly
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] MongoDB authentication enabled
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] SSL certificate installed
- [ ] Rate limiting enabled
- [ ] CORS configured with specific origins
- [ ] Regular security updates applied
- [ ] Backups automated and tested
- [ ] Monitoring and alerting configured

---

## Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Check health endpoints
- Review error logs
- Monitor resource usage

**Weekly:**
- Review metrics and performance
- Check backup integrity
- Update dependencies (if needed)

**Monthly:**
- Security updates
- Test backup restore
- Review and optimize database
- Performance testing

---

## Additional Resources

- [API Documentation](./API.md) (to be created)
- [Architecture Diagram](./ARCHITECTURE.md) (to be created)
- [Troubleshooting Guide](./TROUBLESHOOTING.md) (to be created)
- [Production Readiness Assessment](./backend/PRODUCTION_READINESS_ASSESSMENT.md)

---

**Last Updated:** February 5, 2026  
**Version:** 1.0
