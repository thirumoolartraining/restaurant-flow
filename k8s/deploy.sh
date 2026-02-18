#!/bin/bash

# Kubernetes Deployment Script
# Usage: ./deploy.sh [environment] [version]
# Example: ./deploy.sh production v1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
VERSION=${2:-latest}
NAMESPACE="restaurant-bot"
REGISTRY="your-registry"

echo -e "${GREEN}🚀 Starting Kubernetes deployment${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Version: ${YELLOW}$VERSION${NC}"
echo -e "Namespace: ${YELLOW}$NAMESPACE${NC}"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Kubernetes cluster is accessible${NC}"

# Create namespace if it doesn't exist
if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo -e "${YELLOW}📦 Creating namespace: $NAMESPACE${NC}"
    kubectl apply -f namespace.yaml
else
    echo -e "${GREEN}✅ Namespace $NAMESPACE already exists${NC}"
fi

# Apply ConfigMap
echo -e "${YELLOW}📝 Applying ConfigMap${NC}"
kubectl apply -f configmap.yaml

# Apply Secrets (if not exists)
if ! kubectl get secret backend-secrets -n $NAMESPACE &> /dev/null; then
    echo -e "${YELLOW}🔐 Creating secrets${NC}"
    echo -e "${RED}⚠️  WARNING: Update secrets.yaml with actual values before deploying to production${NC}"
    kubectl apply -f secrets.yaml
else
    echo -e "${GREEN}✅ Secrets already exist${NC}"
fi

# Apply Resource Quotas
echo -e "${YELLOW}📊 Applying resource quotas${NC}"
kubectl apply -f resource-quota.yaml

# Deploy MongoDB
echo -e "${YELLOW}🗄️  Deploying MongoDB${NC}"
kubectl apply -f mongodb-deployment.yaml

# Wait for MongoDB to be ready
echo -e "${YELLOW}⏳ Waiting for MongoDB to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=mongodb -n $NAMESPACE --timeout=300s
echo -e "${GREEN}✅ MongoDB is ready${NC}"

# Deploy Redis
echo -e "${YELLOW}📦 Deploying Redis${NC}"
kubectl apply -f redis-deployment.yaml

# Wait for Redis to be ready
echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=300s
echo -e "${GREEN}✅ Redis is ready${NC}"

# Update image tags
echo -e "${YELLOW}🏷️  Updating image tags to $VERSION${NC}"
sed -i.bak "s|$REGISTRY/restaurant-backend:.*|$REGISTRY/restaurant-backend:$VERSION|g" backend-deployment.yaml
sed -i.bak "s|$REGISTRY/restaurant-frontend:.*|$REGISTRY/restaurant-frontend:$VERSION|g" frontend-deployment.yaml

# Deploy Backend
echo -e "${YELLOW}🔧 Deploying Backend${NC}"
kubectl apply -f backend-deployment.yaml

# Wait for backend rollout
echo -e "${YELLOW}⏳ Waiting for backend rollout...${NC}"
kubectl rollout status deployment/backend -n $NAMESPACE --timeout=300s
echo -e "${GREEN}✅ Backend deployed successfully${NC}"

# Deploy Frontend
echo -e "${YELLOW}🎨 Deploying Frontend${NC}"
kubectl apply -f frontend-deployment.yaml

# Wait for frontend rollout
echo -e "${YELLOW}⏳ Waiting for frontend rollout...${NC}"
kubectl rollout status deployment/frontend -n $NAMESPACE --timeout=300s
echo -e "${GREEN}✅ Frontend deployed successfully${NC}"

# Apply HPA
echo -e "${YELLOW}📈 Applying Horizontal Pod Autoscaler${NC}"
kubectl apply -f hpa.yaml

# Apply Network Policies
echo -e "${YELLOW}🔒 Applying Network Policies${NC}"
kubectl apply -f network-policy.yaml

# Apply Pod Disruption Budgets
echo -e "${YELLOW}🛡️  Applying Pod Disruption Budgets${NC}"
kubectl apply -f pod-disruption-budget.yaml

# Apply Ingress
echo -e "${YELLOW}🌐 Applying Ingress${NC}"
kubectl apply -f ingress.yaml

# Restore backup files
rm -f backend-deployment.yaml.bak frontend-deployment.yaml.bak

# Get deployment status
echo -e "\n${GREEN}📊 Deployment Status:${NC}"
kubectl get all -n $NAMESPACE

# Get HPA status
echo -e "\n${GREEN}📈 Auto-scaling Status:${NC}"
kubectl get hpa -n $NAMESPACE

# Get Ingress status
echo -e "\n${GREEN}🌐 Ingress Status:${NC}"
kubectl get ingress -n $NAMESPACE

# Get Load Balancer IP
echo -e "\n${GREEN}🔗 Load Balancer:${NC}"
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -n "$INGRESS_IP" ]; then
    echo -e "Load Balancer IP: ${YELLOW}$INGRESS_IP${NC}"
    echo -e "Update your DNS to point to this IP"
else
    echo -e "${YELLOW}⏳ Load Balancer IP not yet assigned${NC}"
fi

echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Update DNS records to point to the load balancer IP"
echo -e "2. Verify SSL certificates: kubectl get certificate -n $NAMESPACE"
echo -e "3. Test the application: curl https://yourdomain.com/health"
echo -e "4. Monitor logs: kubectl logs -f deployment/backend -n $NAMESPACE"
echo -e "5. Watch auto-scaling: kubectl get hpa -n $NAMESPACE -w"
