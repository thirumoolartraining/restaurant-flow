const axios = require('axios');
const NoopNotifier = require('./noopNotifier');

class SlackNotifier {
  constructor(webhookUrl = process.env.SLACK_WEBHOOK_URL) {
    this.webhookUrl = webhookUrl;
  }

  async notify(alert) {
    if (!this.webhookUrl) {
      return new NoopNotifier('slack').notify(alert);
    }

    await axios.post(this.webhookUrl, {
      text: `🚨 ${alert.title}`,
      attachments: [{
        color: alert.severity === 'critical' ? '#FF0000' : '#FFA500',
        text: alert.message,
        fields: Object.entries(alert.metadata || {}).map(([title, value]) => ({
          title,
          value: String(value),
          short: true
        }))
      }]
    }, { timeout: 5000 });

    return { delivered: true, channel: 'slack' };
  }
}

module.exports = SlackNotifier;
