const NoopNotifier = require('./noopNotifier');

class EmailNotifier {
  constructor(recipient = process.env.ALERT_EMAIL || process.env.BREVO_FROM_EMAIL) {
    this.recipient = recipient;
  }

  async notify(alert) {
    if (!this.recipient) {
      return new NoopNotifier('email').notify(alert);
    }

    const brevoMail = require('../brevoMail');
    await brevoMail.sendEmail(
      this.recipient,
      `[${(alert.severity || 'info').toUpperCase()}] ${alert.title}`,
      `${alert.message}<br/><pre>${JSON.stringify(alert.metadata || {}, null, 2)}</pre>`
    );

    return { delivered: true, channel: 'email' };
  }
}

module.exports = EmailNotifier;
