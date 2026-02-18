const logger = require('../logger');
const SlackNotifier = require('./slackNotifier');
const EmailNotifier = require('./emailNotifier');

class AlertService {
  constructor(notifiers = [new SlackNotifier(), new EmailNotifier()]) {
    this.notifiers = notifiers;
  }

  async send(alert) {
    logger.info('Alert triggered', {
      title: alert.title,
      severity: alert.severity,
      metadata: alert.metadata || {}
    });

    const results = await Promise.allSettled(this.notifiers.map((notifier) => notifier.notify(alert)));
    return results;
  }
}

module.exports = AlertService;
