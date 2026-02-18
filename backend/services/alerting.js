/**
 * Alerting Service - Phase 6.5
 * 
 * Purpose: Send alerts for critical errors and system issues
 * 
 * Supported Channels:
 * - Slack (webhooks)
 * - Email (Brevo)
 * - Console (fallback)
 * 
 * Alert Types:
 * - Critical errors
 * - High error rates
 * - External API failures
 * - Queue failures
 * - Database connection issues
 */

const axios = require('axios');
const logger = require('./logger');

// Alert configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ALERT_EMAIL = process.env.ALERT_EMAIL || process.env.BREVO_FROM_EMAIL;
const ENABLE_SLACK = !!SLACK_WEBHOOK_URL;
const ENABLE_EMAIL = !!ALERT_EMAIL;

// Rate limiting for alerts (prevent spam)
const alertCache = new Map();
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

/**
 * Check if alert should be sent (rate limiting)
 */
function shouldSendAlert(alertKey) {
  const lastSent = alertCache.get(alertKey);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < ALERT_COOLDOWN) {
    return false; // Too soon, skip
  }
  
  alertCache.set(alertKey, now);
  return true;
}

/**
 * Send Slack alert
 */
async function sendSlackAlert(title, message, severity = 'error', metadata = {}) {
  if (!ENABLE_SLACK) {
    return false;
  }
  
  try {
    const color = {
      critical: '#FF0000',
      error: '#FF6B6B',
      warning: '#FFA500',
      info: '#4A90E2'
    }[severity] || '#FF6B6B';
    
    const emoji = {
      critical: ':rotating_light:',
      error: ':x:',
      warning: ':warning:',
      info: ':information_source:'
    }[severity] || ':x:';
    
    const payload = {
      text: `${emoji} *${title}*`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Message',
              value: message,
              short: false
            },
            {
              title: 'Severity',
              value: severity.toUpperCase(),
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            },
            {
              title: 'Environment',
              value: process.env.NODE_ENV || 'development',
              short: true
            },
            {
              title: 'Server',
              value: process.env.BACKEND_URL || 'https://restaruntbot.onrender.com',
              short: true
            }
          ]
        }
      ]
    };
    
    // Add metadata fields
    if (Object.keys(metadata).length > 0) {
      payload.attachments[0].fields.push({
        title: 'Details',
        value: '```' + JSON.stringify(metadata, null, 2) + '```',
        short: false
      });
    }
    
    await axios.post(SLACK_WEBHOOK_URL, payload, {
      timeout: 5000
    });
    
    return true;
  } catch (error) {
    logger.error('❌ [Alerting] Failed to send Slack alert:', error.message);
    return false;
  }
}

/**
 * Send email alert
 */
async function sendEmailAlert(title, message, severity = 'error', metadata = {}) {
  if (!ENABLE_EMAIL) {
    return false;
  }
  
  try {
    const brevoMail = require('./brevoMail');
    
    const htmlContent = `
      <h2 style="color: ${severity === 'critical' ? '#FF0000' : '#FF6B6B'};">${title}</h2>
      <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
      <p><strong>Message:</strong> ${message}</p>
      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
      ${Object.keys(metadata).length > 0 ? `
        <h3>Details:</h3>
        <pre>${JSON.stringify(metadata, null, 2)}</pre>
      ` : ''}
    `;
    
    await brevoMail.sendEmail(
      ALERT_EMAIL,
      `[ALERT] ${title}`,
      htmlContent
    );
    
    return true;
  } catch (error) {
    logger.error('❌ [Alerting] Failed to send email alert:', error.message);
    return false;
  }
}

/**
 * Send console alert (fallback)
 */
function sendConsoleAlert(title, message, severity = 'error', metadata = {}) {
  const emoji = {
    critical: '🚨',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  }[severity] || '❌';
  
  logger.error(`\n${emoji} [ALERT] ${title}`);
  logger.error(`Severity: ${severity.toUpperCase()}`);
  logger.error(`Message: ${message}`);
  logger.error(`Timestamp: ${new Date().toISOString()}`);
  
  if (Object.keys(metadata).length > 0) {
    logger.error('Details:', JSON.stringify(metadata, null, 2));
  }
  
  logger.error(''); // Empty line
}

/**
 * Send alert through all configured channels
 */
async function sendAlert(title, message, severity = 'error', metadata = {}) {
  const alertKey = `${severity}:${title}`;
  
  // Check rate limiting
  if (!shouldSendAlert(alertKey)) {
    logger.info(`⏭️ [Alerting] Skipping alert (cooldown): ${title}`);
    return;
  }
  
  logger.info(`📢 [Alerting] Sending alert: ${title}`);
  
  // Send through all channels
  const results = await Promise.allSettled([
    sendSlackAlert(title, message, severity, metadata),
    sendEmailAlert(title, message, severity, metadata)
  ]);
  
  // Always log to console
  sendConsoleAlert(title, message, severity, metadata);
  
  // Check if any channel succeeded
  const anySuccess = results.some(r => r.status === 'fulfilled' && r.value === true);
  
  if (!anySuccess && (ENABLE_SLACK || ENABLE_EMAIL)) {
    logger.warn('⚠️ [Alerting] All alert channels failed, check configuration');
  }
}

/**
 * Alert for critical error
 */
async function alertCriticalError(error, context = {}) {
  await sendAlert(
    'Critical Error',
    error.message || 'Unknown error',
    'critical',
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines
        code: error.code
      },
      ...context
    }
  );
}

/**
 * Alert for high error rate
 */
async function alertHighErrorRate(errorRate, threshold, timeWindow) {
  await sendAlert(
    'High Error Rate Detected',
    `Error rate (${errorRate}%) exceeded threshold (${threshold}%) in the last ${timeWindow}`,
    'error',
    {
      errorRate: `${errorRate}%`,
      threshold: `${threshold}%`,
      timeWindow
    }
  );
}

/**
 * Alert for external API failure
 */
async function alertApiFailure(service, error, failureCount) {
  await sendAlert(
    `External API Failure: ${service}`,
    `${service} API has failed ${failureCount} times`,
    'error',
    {
      service,
      error: error.message,
      failureCount
    }
  );
}

/**
 * Alert for queue failure
 */
async function alertQueueFailure(queueName, error, jobCount) {
  await sendAlert(
    `Queue Failure: ${queueName}`,
    `Queue ${queueName} has ${jobCount} failed jobs`,
    'error',
    {
      queueName,
      error: error.message,
      failedJobs: jobCount
    }
  );
}

/**
 * Alert for database connection issue
 */
async function alertDatabaseIssue(error) {
  await sendAlert(
    'Database Connection Issue',
    'Database connection failed or is unstable',
    'critical',
    {
      error: error.message,
      type: 'database'
    }
  );
}

/**
 * Alert for Redis connection issue
 */
async function alertRedisIssue(error) {
  await sendAlert(
    'Redis Connection Issue',
    'Redis connection failed or is unstable',
    'error',
    {
      error: error.message,
      type: 'redis'
    }
  );
}

/**
 * Test alert (for configuration verification)
 */
async function sendTestAlert() {
  await sendAlert(
    'Test Alert',
    'This is a test alert to verify alerting configuration',
    'info',
    {
      test: true,
      timestamp: new Date().toISOString()
    }
  );
}

/**
 * Get alerting configuration status
 */
function getAlertingStatus() {
  return {
    slack: {
      enabled: ENABLE_SLACK,
      configured: !!SLACK_WEBHOOK_URL
    },
    email: {
      enabled: ENABLE_EMAIL,
      configured: !!ALERT_EMAIL,
      recipient: ALERT_EMAIL
    },
    console: {
      enabled: true,
      configured: true
    },
    cooldown: `${ALERT_COOLDOWN / 1000}s`,
    activeAlerts: alertCache.size
  };
}

module.exports = {
  sendAlert,
  alertCriticalError,
  alertHighErrorRate,
  alertApiFailure,
  alertQueueFailure,
  alertDatabaseIssue,
  alertRedisIssue,
  sendTestAlert,
  getAlertingStatus
};
