# Load Testing

Performance testing and benchmarking for the Restaurant WhatsApp Bot API.

## Prerequisites

### Install K6

**macOS:**
```bash
brew install k6
```

**Windows:**
```bash
choco install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

## Running Tests

### Smoke Test (1 user, 1 minute)

Quick test to verify system works:

```bash
k6 run --vus 1 --duration 1m k6-load-test.js
```

### Load Test (100 users, 5 minutes)

Normal expected load:

```bash
k6 run --vus 100 --duration 5m k6-load-test.js
```

### Stress Test (200 users, 10 minutes)

Find breaking point:

```bash
k6 run --vus 200 --duration 10m k6-load-test.js
```

### Spike Test

Sudden traffic spike:

```bash
k6 run --stage 1m:10,1m:100,1m:200,1m:10 k6-load-test.js
```

### Custom Environment

```bash
k6 run --env BASE_URL=https://api.yourdomain.com k6-load-test.js
```

### With Docker

```bash
docker run --rm -i grafana/k6 run --vus 100 --duration 5m - < k6-load-test.js
```

## Test Scenarios

### 1. Smoke Test
- **VUs:** 1
- **Duration:** 1 minute
- **Purpose:** Verify system works with minimal load

### 2. Load Test
- **VUs:** 0 → 50 → 100 → 0
- **Duration:** 16 minutes
- **Purpose:** Test normal expected load

### 3. Stress Test
- **VUs:** 0 → 100 → 200 → 300 → 0
- **Duration:** 24 minutes
- **Purpose:** Find system breaking point

### 4. Spike Test
- **VUs:** 10 → 500 → 10 → 0
- **Duration:** 8 minutes
- **Purpose:** Test sudden traffic spike

## Endpoints Tested

1. **Health Check** - `GET /health`
   - Expected: < 100ms
   
2. **Get Menu** - `GET /api/public/menu`
   - Expected: < 500ms
   
3. **Get Categories** - `GET /api/public/categories`
   - Expected: < 300ms
   
4. **Get Offers** - `GET /api/public/offers`
   - Expected: < 300ms
   
5. **Get Settings** - `GET /api/public/settings`
   - Expected: < 200ms

## Performance Thresholds

- **95th percentile:** < 500ms
- **99th percentile:** < 1000ms
- **Error rate:** < 1%
- **Failed requests:** < 5%

## Interpreting Results

### Good Performance
```
✅ http_req_duration..............: avg=150ms  p(95)=300ms  p(99)=500ms
✅ http_req_failed................: 0.5%
✅ errors.........................: 0.2%
```

### Poor Performance
```
❌ http_req_duration..............: avg=800ms  p(95)=1500ms  p(99)=3000ms
❌ http_req_failed................: 5.2%
❌ errors.........................: 3.1%
```

## Metrics Explained

- **http_req_duration:** Time from request start to response end
- **http_req_failed:** Percentage of failed HTTP requests
- **errors:** Custom error rate from checks
- **p(95):** 95th percentile (95% of requests faster than this)
- **p(99):** 99th percentile (99% of requests faster than this)

## Output Files

- `summary.json` - Detailed test results in JSON format

## Monitoring During Tests

### Watch Server Logs
```bash
kubectl logs -f deployment/backend -n restaurant-bot
```

### Watch Auto-scaling
```bash
kubectl get hpa -n restaurant-bot -w
```

### Watch Pod Metrics
```bash
kubectl top pods -n restaurant-bot
```

### Watch Redis Cache
```bash
kubectl exec -it deployment/redis -n restaurant-bot -- redis-cli INFO stats
```

## Performance Optimization Tips

### If Response Times Are High:

1. **Enable Redis caching**
   - Check cache hit rate
   - Warm cache before testing

2. **Optimize database queries**
   - Add indexes
   - Use lean() queries
   - Limit result sets

3. **Scale horizontally**
   - Increase HPA max replicas
   - Add more backend pods

4. **Optimize code**
   - Remove unnecessary middleware
   - Reduce payload sizes
   - Use compression

### If Error Rate Is High:

1. **Check resource limits**
   - Increase memory/CPU limits
   - Check for OOM kills

2. **Check database connections**
   - Increase connection pool size
   - Check for connection timeouts

3. **Check external APIs**
   - Verify circuit breakers
   - Check API rate limits

4. **Check logs**
   - Look for error patterns
   - Check for exceptions

## Continuous Performance Testing

### GitHub Actions Integration

Add to `.github/workflows/performance.yml`:

```yaml
name: Performance Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run K6 Load Test
        uses: grafana/k6-action@v0.3.0
        with:
          filename: loadtest/k6-load-test.js
          flags: --vus 50 --duration 5m
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: loadtest/summary.json
```

## Best Practices

1. **Start small** - Begin with smoke tests
2. **Ramp gradually** - Don't spike immediately
3. **Monitor everything** - Watch logs, metrics, and resources
4. **Test in staging** - Never load test production without permission
5. **Document baselines** - Record normal performance metrics
6. **Test regularly** - Run performance tests on every release
7. **Analyze trends** - Compare results over time

## Troubleshooting

### K6 Installation Issues

```bash
# Verify installation
k6 version

# Test with simple script
k6 run --vus 1 --duration 10s https://test.k6.io/
```

### Connection Refused

- Check if server is running
- Verify BASE_URL is correct
- Check firewall rules

### High Error Rate

- Check server logs
- Verify database is running
- Check resource limits

### Inconsistent Results

- Run multiple times
- Check for background processes
- Ensure stable network

## Additional Resources

- [K6 Documentation](https://k6.io/docs/)
- [Performance Testing Best Practices](https://k6.io/docs/testing-guides/test-types/)
- [K6 Examples](https://k6.io/docs/examples/)
