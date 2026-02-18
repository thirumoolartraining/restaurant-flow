# Operations Runbook

**Project:** Restaurant WhatsApp Bot (Full Stack)
**Version:** 1.0.0
**Last Updated:** February 5, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monitoring & Alerts](#monitoring--alerts)
3. [Common Operations](#common-operations)
4. [Incident Response](#incident-response)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Disaster Recovery](#disaster-recovery)
8. [Performance Optimization](#performance-optimization)
9. [Security Operations](#security-operations)
10. [On-Call Procedures](#on-call-procedures)

---

## System Overview

### Production Environment

- **Backend**: 3-10 pods (auto-scaling)
- **Frontend**: 2-6 pods (auto-scaling)
- **Database**: MongoDB (20Gi PVC)
- **Cache/Queue**: Redis (5Gi PVC)
- **Load Balancer**: NGINX Ingress
- **Monitoring**: Logs + Metrics + Alerts

### Key Metrics

- **Uptime Target**: 99.9% (8.76 hours downtime/year)
- **Response Time**: p95 < 500ms, p99 < 1000ms
- **Error Rate**: < 1%
- **Request Rate**: 100 RPS per IP
- **Cache Hit Rate**: > 80%

### Service Dependencies

```
Backend → MongoDB (critical)
Backend → Redis (critical)
Backend → WhatsApp API (critical)
Backend → Razorpay API (important)
Backend → Cloudinary API (important)
Backend → Google Sheets (optional)
```

---

## Monitoring & Alerts

### Health Check Endpoints

```bash
# Basic health check
curl https://api.yourdomain.com/health
# Response: {"status":"ok","timestamp":"..."}

# Readiness check (includes DB + Redis)
curl https://api.yourdomain.com/health/ready
# Response: {"status":"ready","database":"connected","redis":"connected"}

# Detailed health check
curl https://api.yourdomain.com/health/detailed
# Response: Full system status with metrics

# Metrics endpoint
curl https://api.yourdomain.com/api/metrics
# Response: Request counts, response times, etc.
```

### Log Locations

```bash
# Kubernetes logs
kubectl logs -f deployment/backend -n restaurant-bot
kubectl logs -f deployment/frontend -n restaurant-bot

# Local logs (if running locally)
backend/logs/combined.log    # All logs
backend/logs/error.log       # Error logs only
backend/logs/app-YYYY-MM-DD.log  # Daily rotated logs
```

### Alert Channels

- **Slack**: #alerts channel for critical errors
- **Email**: ops-team@yourdomain.com for error summaries
- **PagerDuty**: (Optional) For on-call escalation

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Error Rate | > 2% | > 5% | Check logs, investigate |
| Response Time (p95) | > 800ms | > 1500ms | Check performance, scale up |
| CPU Usage | > 70% | > 85% | Scale up pods |
| Memory Usage | > 80% | > 90% | Scale up pods, check leaks |
| Database Connections | > 8 | > 9 | Check connection pool |
| Redis Memory | > 80% | > 90% | Clear cache, scale up |
| Disk Usage | > 80% | > 90% | Clean up logs, expand storage |
| Failed Jobs (Queue) | > 10 | > 50 | Check queue, retry failed |

---

## Common Operations

### 1. Scaling Operations

#### Manual Scaling

```bash
# Scale backend pods
kubectl scale deployment backend --replicas=5 -n restaurant-bot

# Scale frontend pods
kubectl scale deployment frontend --replicas=4 -n restaurant-bot

# Verify scaling
kubectl get pods -n restaurant-bot
```

#### Auto-scaling Configuration

```bash
# View HPA status
kubectl get hpa -n restaurant-bot

# Edit HPA thresholds
kubectl edit hpa backend-hpa -n restaurant-bot

# Example: Change CPU threshold to 80%
# spec:
#   metrics:
#   - type: Resource
#     resource:
#       name: cpu
#       target:
#         type: Utilization
#         averageUtilization: 80
```

### 2. Deployment Operations

#### Rolling Update

```bash
# Update backend image
kubectl set image deployment/backend \
  backend=your-registry/restaurant-backend:v1.2.3 \
  -n restaurant-bot

# Watch rollout status
kubectl rollout status deployment/backend -n restaurant-bot

# Check rollout history
kubectl rollout history deployment/backend -n restaurant-bot
```

#### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/backend -n restaurant-bot

# Rollback to specific revision
kubectl rollout undo deployment/backend --to-revision=2 -n restaurant-bot

# Verify rollback
kubectl rollout status deployment/backend -n restaurant-bot
```

#### Blue-Green Deployment

```bash
# Deploy green version
kubectl apply -f k8s/backend-deployment-green.yaml

# Test green version
curl https://green.api.yourdomain.com/health

# Switch traffic to green
kubectl patch service backend -n restaurant-bot \
  -p '{"spec":{"selector":{"version":"green"}}}'

# Verify traffic switch
kubectl get service backend -n restaurant-bot -o yaml

# Remove blue version (after verification)
kubectl delete deployment backend-blue -n restaurant-bot
```

### 3. Cache Operations

#### View Cache Statistics

```bash
# Get cache stats
curl -X GET https://api.yourdomain.com/api/cache/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response:
# {
#   "hits": 1500,
#   "misses": 300,
#   "hitRate": 0.83,
#   "keys": 45,
#   "memory": "12.5MB"
# }
```

#### Warm Cache

```bash
# Warm cache with frequently accessed data
curl -X POST https://api.yourdomain.com/api/cache/warm \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Clear Cache

```bash
# Clear all cache
curl -X DELETE https://api.yourdomain.com/api/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Clear specific namespace
curl -X DELETE https://api.yourdomain.com/api/cache/menu \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Clear specific item
curl -X DELETE https://api.yourdomain.com/api/cache/menu/all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 4. Database Operations

#### Database Monitoring

```bash
# Get database monitoring report
curl -X GET https://api.yourdomain.com/api/database/monitoring/report \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get slow queries
curl -X GET https://api.yourdomain.com/api/database/monitoring/slow-queries?limit=10 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get database statistics
curl -X GET https://api.yourdomain.com/api/database/monitoring/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Database Backup

```bash
# Manual backup
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongodump --out=/backup/manual-$(date +%Y%m%d-%H%M%S)

# Copy backup to local
kubectl cp restaurant-bot/mongodb-0:/backup/manual-20260205-120000 \
  ./backups/manual-20260205-120000

# Automated backup (runs daily)
# Check backup script: backend/scripts/backup-database.sh
```

#### Database Restore

```bash
# Copy backup to pod
kubectl cp ./backups/backup-20260205-120000 \
  restaurant-bot/mongodb-0:/backup/restore

# Restore database
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongorestore --drop /backup/restore

# Verify restore
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongo --eval "db.orders.count()"
```

#### Run Data Retention Cleanup

```bash
# Check retention status
curl -X GET https://api.yourdomain.com/api/database/retention/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Run manual cleanup
curl -X POST https://api.yourdomain.com/api/database/retention/run \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response:
# {
#   "success": true,
#   "deleted": {
#     "orders": 150,
#     "messages": 500
#   }
# }
```

### 5. Queue Operations

#### View Queue Statistics

```bash
# Get queue stats
curl -X GET https://api.yourdomain.com/api/webhook/queue/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response:
# {
#   "waiting": 5,
#   "active": 2,
#   "completed": 1500,
#   "failed": 10
# }
```

#### Manage Failed Jobs

```bash
# Get failed jobs
curl -X GET https://api.yourdomain.com/api/webhook/queue/failed \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Retry specific job
curl -X POST https://api.yourdomain.com/api/webhook/queue/retry/12345 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Clean old jobs
curl -X POST https://api.yourdomain.com/api/webhook/queue/clean \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Pause/Resume Queue

```bash
# Pause queue (during maintenance)
curl -X POST https://api.yourdomain.com/api/webhook/queue/pause \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Resume queue
curl -X POST https://api.yourdomain.com/api/webhook/queue/resume \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Incident Response

### Incident Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P0 - Critical | Complete service outage | 15 minutes | Database down, all APIs failing |
| P1 - High | Major feature broken | 1 hour | Payment processing failing |
| P2 - Medium | Minor feature broken | 4 hours | Image upload not working |
| P3 - Low | Cosmetic issue | 1 day | UI alignment issue |

### Incident Response Process

#### 1. Detection & Alert

```bash
# Check alert in Slack #alerts channel
# Example: "🚨 CRITICAL: Error rate > 5% (current: 8.2%)"

# Acknowledge incident
# Reply in thread: "Acknowledged. Investigating."
```

#### 2. Initial Assessment

```bash
# Check system health
curl https://api.yourdomain.com/health/detailed

# Check recent logs
kubectl logs --tail=100 deployment/backend -n restaurant-bot

# Check metrics
curl https://api.yourdomain.com/api/metrics

# Check pod status
kubectl get pods -n restaurant-bot
```

#### 3. Diagnosis

```bash
# Check for common issues:

# 1. Database connectivity
kubectl exec -it mongodb-0 -n restaurant-bot -- mongo --eval "db.runCommand({ping:1})"

# 2. Redis connectivity
kubectl exec -it redis-0 -n restaurant-bot -- redis-cli ping

# 3. External API status
curl https://graph.facebook.com/v18.0/health

# 4. Resource usage
kubectl top pods -n restaurant-bot

# 5. Recent deployments
kubectl rollout history deployment/backend -n restaurant-bot
```

#### 4. Mitigation

```bash
# Quick fixes:

# Restart pods
kubectl rollout restart deployment/backend -n restaurant-bot

# Scale up
kubectl scale deployment backend --replicas=10 -n restaurant-bot

# Rollback deployment
kubectl rollout undo deployment/backend -n restaurant-bot

# Clear cache
curl -X DELETE https://api.yourdomain.com/api/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Pause queue (if needed)
curl -X POST https://api.yourdomain.com/api/webhook/queue/pause \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### 5. Resolution & Communication

```bash
# Update incident status
# Post in #alerts: "✅ RESOLVED: Error rate back to normal (0.5%)"

# Document incident
# Create post-mortem document with:
# - Timeline
# - Root cause
# - Impact
# - Resolution
# - Action items
```

---

## Troubleshooting Guide

### Issue: High Error Rate

**Symptoms:**
- Error rate > 5%
- Alerts in Slack
- Customer complaints

**Diagnosis:**
```bash
# Check error logs
kubectl logs --tail=500 deployment/backend -n restaurant-bot | grep ERROR

# Check specific error types
kubectl logs deployment/backend -n restaurant-bot | grep "MongoError"
kubectl logs deployment/backend -n restaurant-bot | grep "RedisError"
```

**Solutions:**
1. Database connection issues → Restart MongoDB pod
2. Redis connection issues → Restart Redis pod
3. External API failures → Check circuit breaker status
4. Code errors → Rollback to previous version

### Issue: Slow Response Times

**Symptoms:**
- p95 > 1000ms
- Slow page loads
- Timeouts

**Diagnosis:**
```bash
# Check slow queries
curl -X GET https://api.yourdomain.com/api/database/monitoring/slow-queries \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check cache hit rate
curl -X GET https://api.yourdomain.com/api/cache/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check resource usage
kubectl top pods -n restaurant-bot
```

**Solutions:**
1. Low cache hit rate → Warm cache
2. Slow database queries → Add indexes, optimize queries
3. High CPU usage → Scale up pods
4. High memory usage → Check for memory leaks, restart pods

### Issue: Database Connection Errors

**Symptoms:**
- "MongoError: connection refused"
- "MongoError: connection timeout"
- Orders not saving

**Diagnosis:**
```bash
# Check MongoDB pod status
kubectl get pods -n restaurant-bot | grep mongodb

# Check MongoDB logs
kubectl logs mongodb-0 -n restaurant-bot

# Test connection
kubectl exec -it mongodb-0 -n restaurant-bot -- mongo --eval "db.runCommand({ping:1})"
```

**Solutions:**
```bash
# Restart MongoDB pod
kubectl delete pod mongodb-0 -n restaurant-bot

# Check persistent volume
kubectl get pvc -n restaurant-bot

# Verify connection string in backend
kubectl get configmap backend-config -n restaurant-bot -o yaml
```

### Issue: Redis Connection Errors

**Symptoms:**
- "RedisError: connection refused"
- Cache not working
- Queue not processing

**Diagnosis:**
```bash
# Check Redis pod status
kubectl get pods -n restaurant-bot | grep redis

# Check Redis logs
kubectl logs redis-0 -n restaurant-bot

# Test connection
kubectl exec -it redis-0 -n restaurant-bot -- redis-cli ping
```

**Solutions:**
```bash
# Restart Redis pod
kubectl delete pod redis-0 -n restaurant-bot

# Check Redis memory
kubectl exec -it redis-0 -n restaurant-bot -- redis-cli INFO memory

# Clear Redis if memory full
kubectl exec -it redis-0 -n restaurant-bot -- redis-cli FLUSHALL
```

### Issue: WhatsApp Messages Not Sending

**Symptoms:**
- Messages stuck in queue
- "WhatsApp API error"
- Customers not receiving responses

**Diagnosis:**
```bash
# Check queue status
curl -X GET https://api.yourdomain.com/api/webhook/queue/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check failed jobs
curl -X GET https://api.yourdomain.com/api/webhook/queue/failed \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check circuit breaker status
kubectl logs deployment/backend -n restaurant-bot | grep "Circuit breaker"
```

**Solutions:**
```bash
# Retry failed jobs
curl -X POST https://api.yourdomain.com/api/webhook/queue/retry/12345 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check WhatsApp API credentials
kubectl get secret backend-secrets -n restaurant-bot -o yaml

# Test WhatsApp API directly
curl -X POST https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages \
  -H "Authorization: Bearer $WHATSAPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"1234567890","text":{"body":"test"}}'
```

### Issue: Payment Processing Failures

**Symptoms:**
- "Razorpay API error"
- Payments not completing
- Refunds failing

**Diagnosis:**
```bash
# Check payment logs
kubectl logs deployment/backend -n restaurant-bot | grep "Payment"

# Check Razorpay API status
curl https://api.razorpay.com/v1/health

# Check circuit breaker
kubectl logs deployment/backend -n restaurant-bot | grep "razorpay"
```

**Solutions:**
```bash
# Verify Razorpay credentials
kubectl get secret backend-secrets -n restaurant-bot -o yaml

# Check webhook configuration
# Login to Razorpay dashboard → Settings → Webhooks

# Retry failed payments manually
# Use admin panel to retry payment for specific order
```

### Issue: High Memory Usage

**Symptoms:**
- Memory > 90%
- Pods being OOMKilled
- Slow performance

**Diagnosis:**
```bash
# Check memory usage
kubectl top pods -n restaurant-bot

# Check pod events
kubectl describe pod backend-xxx -n restaurant-bot

# Check for memory leaks
kubectl logs deployment/backend -n restaurant-bot | grep "heap"
```

**Solutions:**
```bash
# Restart pods
kubectl rollout restart deployment/backend -n restaurant-bot

# Increase memory limits
kubectl edit deployment backend -n restaurant-bot
# Update: resources.limits.memory: "1Gi"

# Scale up pods
kubectl scale deployment backend --replicas=5 -n restaurant-bot

# Check for memory leaks in code
# Review recent code changes
# Add memory profiling
```

### Issue: Disk Space Full

**Symptoms:**
- "No space left on device"
- Logs not writing
- Database writes failing

**Diagnosis:**
```bash
# Check disk usage
kubectl exec -it mongodb-0 -n restaurant-bot -- df -h

# Check log sizes
kubectl exec -it backend-xxx -n restaurant-bot -- du -sh /app/logs/*
```

**Solutions:**
```bash
# Clean old logs
kubectl exec -it backend-xxx -n restaurant-bot -- \
  find /app/logs -name "*.log" -mtime +14 -delete

# Expand persistent volume
kubectl edit pvc mongodb-pvc -n restaurant-bot
# Update: spec.resources.requests.storage: "30Gi"

# Run data retention cleanup
curl -X POST https://api.yourdomain.com/api/database/retention/run \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Maintenance Procedures

### Scheduled Maintenance Window

**Recommended:** Sunday 2:00 AM - 4:00 AM (low traffic)

#### Pre-Maintenance Checklist

- [ ] Announce maintenance in advance (48 hours)
- [ ] Create database backup
- [ ] Test rollback procedure
- [ ] Prepare rollback plan
- [ ] Notify on-call team
- [ ] Update status page

#### During Maintenance

```bash
# 1. Enable maintenance mode (optional)
kubectl scale deployment frontend --replicas=1 -n restaurant-bot
# Update frontend to show maintenance message

# 2. Pause queue
curl -X POST https://api.yourdomain.com/api/webhook/queue/pause \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Perform maintenance tasks
# - Database migrations
# - Configuration updates
# - Version upgrades

# 4. Resume queue
curl -X POST https://api.yourdomain.com/api/webhook/queue/resume \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 5. Disable maintenance mode
kubectl scale deployment frontend --replicas=2 -n restaurant-bot

# 6. Verify system health
curl https://api.yourdomain.com/health/detailed
```

#### Post-Maintenance Checklist

- [ ] Verify all services running
- [ ] Check error rates
- [ ] Monitor performance
- [ ] Update status page
- [ ] Document changes
- [ ] Send completion notification

### Database Migrations

```bash
# 1. Backup database
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongodump --out=/backup/pre-migration-$(date +%Y%m%d)

# 2. Run migrations
kubectl exec -it backend-xxx -n restaurant-bot -- \
  npm run migrate:up

# 3. Verify migrations
kubectl exec -it backend-xxx -n restaurant-bot -- \
  npm run migrate:status

# 4. Rollback if needed
kubectl exec -it backend-xxx -n restaurant-bot -- \
  npm run migrate:down
```

### Certificate Renewal

```bash
# Check certificate expiry
kubectl get certificate -n restaurant-bot

# Renew certificate (cert-manager auto-renews)
# Manual renewal if needed:
kubectl delete certificate tls-secret -n restaurant-bot
# cert-manager will recreate automatically

# Verify new certificate
kubectl describe certificate tls-secret -n restaurant-bot
```

### Log Rotation

```bash
# Logs rotate automatically daily
# Manual rotation if needed:

# Check log sizes
kubectl exec -it backend-xxx -n restaurant-bot -- \
  ls -lh /app/logs/

# Compress old logs
kubectl exec -it backend-xxx -n restaurant-bot -- \
  gzip /app/logs/app-2026-02-01.log

# Delete old logs (>14 days)
kubectl exec -it backend-xxx -n restaurant-bot -- \
  find /app/logs -name "*.log.gz" -mtime +14 -delete
```

---

## Disaster Recovery

### Recovery Time Objective (RTO)

- **Critical Services**: 1 hour
- **Non-Critical Services**: 4 hours

### Recovery Point Objective (RPO)

- **Database**: 24 hours (daily backups)
- **Logs**: 1 hour (real-time)
- **Cache**: 0 (can be rebuilt)

### Disaster Scenarios

#### Scenario 1: Complete Cluster Failure

**Recovery Steps:**

```bash
# 1. Provision new Kubernetes cluster
# Follow KUBERNETES_DEPLOYMENT.md

# 2. Restore database from backup
# Copy latest backup to new cluster
kubectl cp ./backups/latest mongodb-0:/backup/restore -n restaurant-bot

# Restore
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongorestore --drop /backup/restore

# 3. Deploy application
cd k8s
./deploy.sh production latest

# 4. Verify services
kubectl get all -n restaurant-bot
curl https://api.yourdomain.com/health/detailed

# 5. Update DNS (if needed)
# Point domain to new cluster IP

# 6. Monitor for issues
kubectl logs -f deployment/backend -n restaurant-bot
```

#### Scenario 2: Database Corruption

**Recovery Steps:**

```bash
# 1. Stop all backend pods
kubectl scale deployment backend --replicas=0 -n restaurant-bot

# 2. Backup corrupted database
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongodump --out=/backup/corrupted-$(date +%Y%m%d)

# 3. Restore from latest good backup
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongorestore --drop /backup/backup-20260204

# 4. Verify data integrity
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongo --eval "db.orders.count()"

# 5. Restart backend pods
kubectl scale deployment backend --replicas=3 -n restaurant-bot

# 6. Monitor for errors
kubectl logs -f deployment/backend -n restaurant-bot
```

#### Scenario 3: Security Breach

**Response Steps:**

```bash
# 1. Isolate affected systems
kubectl scale deployment backend --replicas=0 -n restaurant-bot

# 2. Rotate all secrets
kubectl delete secret backend-secrets -n restaurant-bot
kubectl create secret generic backend-secrets --from-env-file=.env

# 3. Review access logs
kubectl logs deployment/backend -n restaurant-bot > security-audit.log

# 4. Patch vulnerabilities
# Update dependencies
# Apply security patches

# 5. Restore from clean backup
# Follow database restoration steps

# 6. Restart services
kubectl scale deployment backend --replicas=3 -n restaurant-bot

# 7. Monitor for suspicious activity
kubectl logs -f deployment/backend -n restaurant-bot | grep "401\|403"
```

---

## Performance Optimization

### Database Optimization

```bash
# 1. Analyze slow queries
curl -X GET https://api.yourdomain.com/api/database/monitoring/slow-queries \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Check index usage
curl -X GET https://api.yourdomain.com/api/database/monitoring/indexes/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Find unused indexes
curl -X GET https://api.yourdomain.com/api/database/monitoring/unused-indexes \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 4. Add missing indexes
kubectl exec -it mongodb-0 -n restaurant-bot -- \
  mongo --eval "db.orders.createIndex({status:1,createdAt:-1})"
```

### Cache Optimization

```bash
# 1. Check cache hit rate
curl -X GET https://api.yourdomain.com/api/cache/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Warm cache
curl -X POST https://api.yourdomain.com/api/cache/warm \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Adjust TTL values
# Edit backend/services/cache.js
# Increase TTL for frequently accessed data
```

### Load Testing

```bash
# Run K6 load test
cd loadtest
k6 run --vus 100 --duration 5m k6-load-test.js

# Analyze results
# Check p95, p99 response times
# Check error rate
# Check throughput
```

---

## Security Operations

### Security Monitoring

```bash
# Check for failed login attempts
kubectl logs deployment/backend -n restaurant-bot | grep "401" | wc -l

# Check for suspicious activity
kubectl logs deployment/backend -n restaurant-bot | grep "SQL\|script\|eval"

# Review access logs
kubectl logs deployment/backend -n restaurant-bot | grep "POST\|PUT\|DELETE"
```

### Security Audits

```bash
# Run npm audit
kubectl exec -it backend-xxx -n restaurant-bot -- npm audit

# Check for outdated dependencies
kubectl exec -it backend-xxx -n restaurant-bot -- npm outdated

# Scan for vulnerabilities
# Use tools like Snyk, Trivy, or Aqua
```

### Incident Response

```bash
# If security breach detected:

# 1. Isolate affected systems
kubectl scale deployment backend --replicas=0 -n restaurant-bot

# 2. Collect evidence
kubectl logs deployment/backend -n restaurant-bot > incident-logs.txt

# 3. Rotate credentials
# Update all API keys, tokens, passwords

# 4. Patch vulnerabilities
# Update code, dependencies

# 5. Restore from clean backup
# Follow disaster recovery procedures

# 6. Monitor for reoccurrence
# Enhanced logging and monitoring
```

---

## On-Call Procedures

### On-Call Responsibilities

- Monitor alerts (Slack #alerts)
- Respond to incidents within SLA
- Escalate if needed
- Document incidents
- Update runbook

### On-Call Rotation

- **Primary**: First responder
- **Secondary**: Backup if primary unavailable
- **Escalation**: Team lead or senior engineer

### Escalation Path

1. **Primary On-Call** → Respond within 15 minutes
2. **Secondary On-Call** → If no response in 30 minutes
3. **Team Lead** → If issue not resolved in 1 hour
4. **Engineering Manager** → For critical business impact

### On-Call Handoff

```markdown
# Handoff Template

**Date:** 2026-02-05
**From:** John Doe
**To:** Jane Smith

**Ongoing Issues:**
- None

**Recent Incidents:**
- 2026-02-04 10:30 AM: High error rate (resolved by cache clear)

**Upcoming Maintenance:**
- 2026-02-07 2:00 AM: Database migration

**Notes:**
- Watch for increased traffic on weekend
- New deployment scheduled for Monday
```

---

## Quick Reference

### Emergency Contacts

- **Team Lead**: +1-555-0100
- **DevOps**: +1-555-0101
- **Database Admin**: +1-555-0102
- **Security**: +1-555-0103

### Important URLs

- **Production API**: https://api.yourdomain.com
- **Admin Panel**: https://admin.yourdomain.com
- **Monitoring**: https://monitoring.yourdomain.com
- **Status Page**: https://status.yourdomain.com
- **Documentation**: https://docs.yourdomain.com

### Common Commands

```bash
# Health check
curl https://api.yourdomain.com/health

# View logs
kubectl logs -f deployment/backend -n restaurant-bot

# Scale pods
kubectl scale deployment backend --replicas=5 -n restaurant-bot

# Restart pods
kubectl rollout restart deployment/backend -n restaurant-bot

# Rollback deployment
kubectl rollout undo deployment/backend -n restaurant-bot

# Clear cache
curl -X DELETE https://api.yourdomain.com/api/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

**Document Version:** 1.0.0
**Last Updated:** February 5, 2026
**Maintained By:** Operations Team
**Next Review:** March 5, 2026
