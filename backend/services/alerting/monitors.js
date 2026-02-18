const logger = require('../logger');
const messageQueue = require('../messageQueue');
const metrics = require('../metrics');
const AlertService = require('./alertService');

const ENABLED = String(process.env.ENABLE_ALERT_MONITORS || 'false').toLowerCase() === 'true';
const INTERVAL_MS = Number(process.env.ALERT_MONITOR_INTERVAL_MS || 60000);
const QUEUE_ALERT_THRESHOLD = Number(process.env.QUEUE_ALERT_THRESHOLD || 100);
const PAYMENT_FAIL_RATE_THRESHOLD = Number(process.env.PAYMENT_FAIL_RATE_THRESHOLD || 0.2);
const EXTERNAL_API_FAIL_THRESHOLD = Number(process.env.EXTERNAL_API_FAIL_THRESHOLD || 5);

const alertService = new AlertService();
let timer = null;
let previousPayments = { failed: 0, completed: 0 };
let previousApis = {};

async function queueDepthMonitor() {
  const stats = await messageQueue.getQueueStats();
  const shouldAlert = stats.waiting > QUEUE_ALERT_THRESHOLD;
  logger.debug('queueDepthMonitor evaluated', { enabled: ENABLED, waiting: stats.waiting, threshold: QUEUE_ALERT_THRESHOLD, shouldAlert });
  if (ENABLED && shouldAlert) {
    await alertService.send({ title: 'Queue depth threshold exceeded', message: `Waiting jobs ${stats.waiting} > ${QUEUE_ALERT_THRESHOLD}`, severity: 'warning', metadata: { waiting: stats.waiting } });
  }
}

async function paymentFailureMonitor() {
  const snapshot = metrics.getMetrics();
  const totalFailed = Number(snapshot.businessEvents['payment.failed'] || 0);
  const totalCompleted = Number(snapshot.businessEvents['payment.completed'] || 0);
  const deltaFailed = Math.max(0, totalFailed - previousPayments.failed);
  const deltaCompleted = Math.max(0, totalCompleted - previousPayments.completed);
  previousPayments = { failed: totalFailed, completed: totalCompleted };
  const total = deltaFailed + deltaCompleted;
  const failureRate = total > 0 ? deltaFailed / total : 0;

  logger.debug('paymentFailureMonitor evaluated', { enabled: ENABLED, deltaFailed, deltaCompleted, failureRate, threshold: PAYMENT_FAIL_RATE_THRESHOLD });
  if (ENABLED && total > 0 && failureRate > PAYMENT_FAIL_RATE_THRESHOLD) {
    await alertService.send({ title: 'Payment failure rate threshold exceeded', message: `Failure rate ${failureRate.toFixed(2)} > ${PAYMENT_FAIL_RATE_THRESHOLD}`, severity: 'error', metadata: { deltaFailed, deltaCompleted, failureRate } });
  }
}

async function externalApiMonitor() {
  const snapshot = metrics.getMetrics();
  const apis = snapshot.externalApis || {};
  for (const [serviceName, values] of Object.entries(apis)) {
    const prev = previousApis[serviceName] || { calls: 0, failures: 0 };
    const deltaFailures = Math.max(0, Number(values.failures || 0) - prev.failures);
    previousApis[serviceName] = { calls: Number(values.calls || 0), failures: Number(values.failures || 0) };

    logger.debug('externalApiMonitor evaluated', { enabled: ENABLED, serviceName, deltaFailures, threshold: EXTERNAL_API_FAIL_THRESHOLD });

    if (ENABLED && deltaFailures > EXTERNAL_API_FAIL_THRESHOLD) {
      await alertService.send({ title: 'External API failures exceeded threshold', message: `${serviceName} failures in interval: ${deltaFailures}`, severity: 'error', metadata: { serviceName, deltaFailures } });
    }
  }
}

async function runAllMonitors() {
  await queueDepthMonitor();
  await paymentFailureMonitor();
  await externalApiMonitor();
}

function startAlertMonitors() {
  logger.info('Alert monitors initialized', { enabled: ENABLED, intervalMs: INTERVAL_MS });
  if (!ENABLED) {
    runAllMonitors().catch(err => logger.warn('Alert monitor dry-run failed', { error: err.message }));
    return;
  }

  timer = setInterval(() => {
    runAllMonitors().catch(err => logger.error('Alert monitor cycle failed', { error: err.message }));
  }, INTERVAL_MS);
}

function stopAlertMonitors() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startAlertMonitors,
  stopAlertMonitors,
  runAllMonitors,
  queueDepthMonitor,
  paymentFailureMonitor,
  externalApiMonitor
};
