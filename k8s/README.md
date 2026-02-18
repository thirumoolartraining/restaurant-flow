# Kubernetes Manifests

Production-ready Kubernetes configuration for the Restaurant WhatsApp Bot.

## Quick Start

```bash
# Deploy everything
chmod +x deploy.sh
./deploy.sh production v1.0.0
```

## Files

### Core Configuration
- `namespace.yaml` - Namespace for all resources
- `configmap.yaml` - Non-sensitive configuration
- `secrets.yaml` - Sensitive data (update before deploying!)
- `resource-quota.yaml` - Namespace resource limits

### Databases
- `mongodb-deployment.yaml` - MongoDB with 20Gi persistent storage
- `redis-deployment.yaml` - Redis with 5Gi persistent storage

### Applications
- `backend-deployment.yaml` - Backend API (3-10 replicas)
- `frontend-deployment.yaml` - Frontend web app (2-6 replicas)

### Scaling & Load Balancing
- `hpa.yaml` - Horizontal Pod Autoscaler (CPU/memory based)
- `ingress.yaml` - NGINX Ingress with SSL/TLS and load balancing

### High Availability
- `pod-disruption-budget.yaml` - Minimum pods during maintenance
- `network-policy.yaml` - Pod-to-pod security policies

### Deployment
- `deploy.sh` - Automated deployment script

## Prerequisites

1. Kubernetes cluster (v1.24+)
2. kubectl configured
3. NGINX Ingress Controller
4. Cert-Manager (for SSL)
5. Metrics Server (for HPA)

## Configuration

### Update Registry

```bash
sed -i 's|your-registry|gcr.io/your-project|g' *.yaml
```

### Update Domain

```bash
sed -i 's|yourdomain.com|your-actual-domain.com|g' ingress.yaml
sed -i 's|your-email@example.com|your-actual-email@example.com|g' ingress.yaml
```

### Create Secrets

```bash
kubectl create secret generic backend-secrets \
  --from-env-file=../backend/.env \
  --namespace=restaurant-bot
```

## Deployment

### Full Deployment

```bash
./deploy.sh production v1.0.0
```

### Manual Deployment

```bash
# 1. Create namespace
kubectl apply -f namespace.yaml

# 2. Apply configuration
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f resource-quota.yaml

# 3. Deploy databases
kubectl apply -f mongodb-deployment.yaml
kubectl apply -f redis-deployment.yaml

# Wait for databases
kubectl wait --for=condition=ready pod -l app=mongodb -n restaurant-bot --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n restaurant-bot --timeout=300s

# 4. Deploy applications
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml

# 5. Apply scaling and policies
kubectl apply -f hpa.yaml
kubectl apply -f network-policy.yaml
kubectl apply -f pod-disruption-budget.yaml

# 6. Deploy ingress
kubectl apply -f ingress.yaml
```

## Monitoring

```bash
# Watch pods
kubectl get pods -n restaurant-bot -w

# Watch auto-scaling
kubectl get hpa -n restaurant-bot -w

# View logs
kubectl logs -f deployment/backend -n restaurant-bot

# Check ingress
kubectl get ingress -n restaurant-bot
```

## Scaling

### Auto-scaling (HPA)

- Backend: 3-10 pods (70% CPU, 80% memory)
- Frontend: 2-6 pods (70% CPU, 80% memory)

### Manual Scaling

```bash
kubectl scale deployment backend --replicas=5 -n restaurant-bot
```

## Updates

### Rolling Update

```bash
kubectl set image deployment/backend \
  backend=your-registry/restaurant-backend:v1.1.0 \
  -n restaurant-bot

kubectl rollout status deployment/backend -n restaurant-bot
```

### Rollback

```bash
kubectl rollout undo deployment/backend -n restaurant-bot
```

## Troubleshooting

```bash
# Check pod status
kubectl describe pod <pod-name> -n restaurant-bot

# View events
kubectl get events -n restaurant-bot --sort-by='.lastTimestamp'

# Get shell in pod
kubectl exec -it deployment/backend -n restaurant-bot -- /bin/sh

# Port forward
kubectl port-forward deployment/backend 5000:5000 -n restaurant-bot
```

## Cleanup

```bash
# Delete everything
kubectl delete namespace restaurant-bot

# Or delete specific resources
kubectl delete -f .
```

## Documentation

See [KUBERNETES_DEPLOYMENT.md](../KUBERNETES_DEPLOYMENT.md) for comprehensive guide.

## Architecture

```
Load Balancer (Ingress)
    ↓
┌───────────┬───────────┐
│  Frontend │  Backend  │
│  (2-6)    │  (3-10)   │
└───────────┴─────┬─────┘
                  │
         ┌────────┴────────┐
         │                 │
    MongoDB            Redis
    (1 pod)          (1 pod)
```

## Features

- ✅ Auto-scaling (HPA)
- ✅ Load balancing (NGINX Ingress)
- ✅ SSL/TLS (cert-manager)
- ✅ High availability (multiple replicas)
- ✅ Rolling updates (zero downtime)
- ✅ Health checks (liveness/readiness)
- ✅ Network policies (security)
- ✅ Resource limits (quotas)
- ✅ Persistent storage (PVCs)

## Support

For issues or questions, see the troubleshooting section in KUBERNETES_DEPLOYMENT.md.
