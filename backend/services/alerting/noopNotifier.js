class NoopNotifier {
  constructor(channel = 'noop') {
    this.channel = channel;
  }

  async notify(alert) {
    return {
      delivered: false,
      channel: this.channel,
      reason: 'channel_not_configured',
      alert
    };
  }
}

module.exports = NoopNotifier;
