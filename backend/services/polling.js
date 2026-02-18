// Polling service for Green API (alternative to webhooks)
// This polls for new messages every few seconds

const axios = require('axios');
const logger = require('./logger');
const chatbot = require('./chatbot');

let isPolling = false;
let pollInterval = null;

const getConfig = () => ({
  instanceId: process.env.GREEN_API_INSTANCE_ID,
  token: process.env.GREEN_API_TOKEN,
  baseUrl: `https://api.green-api.com/waInstance${process.env.GREEN_API_INSTANCE_ID}`
});

const polling = {
  async receiveNotification() {
    try {
      const { baseUrl, token } = getConfig();
      const response = await axios.get(`${baseUrl}/receiveNotification/${token}`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      if (error.code !== 'ECONNABORTED') {
        logger.error('Polling error:', error.message);
      }
      return null;
    }
  },

  async deleteNotification(receiptId) {
    try {
      const { baseUrl, token } = getConfig();
      await axios.delete(`${baseUrl}/deleteNotification/${token}/${receiptId}`);
    } catch (error) {
      logger.error('Delete notification error:', error.message);
    }
  },

  async processNotification(notification) {
    if (!notification || !notification.body) return;

    const { typeWebhook, senderData, messageData } = notification.body;

    if (typeWebhook === 'incomingMessageReceived') {
      const phone = senderData?.sender?.replace('@c.us', '') || '';
      let message = '';
      let messageType = 'text';
      let selectedId = null;

      if (messageData?.typeMessage === 'textMessage') {
        message = messageData.textMessageData?.textMessage || '';
      } else if (messageData?.typeMessage === 'extendedTextMessage') {
        message = messageData.extendedTextMessageData?.text || '';
      } else if (messageData?.typeMessage === 'buttonsResponseMessage') {
        selectedId = messageData.buttonsResponseMessage?.selectedButtonId || '';
        message = messageData.buttonsResponseMessage?.selectedButtonText || '';
        messageType = 'button';
      } else if (messageData?.typeMessage === 'listResponseMessage') {
        selectedId = messageData.listResponseMessage?.singleSelectReply?.selectedRowId || '';
        message = messageData.listResponseMessage?.title || '';
        messageType = 'list';
      }

      if (phone && (message || selectedId)) {
        logger.info('📱 Processing message:', { phone, message, messageType, selectedId });
        await chatbot.handleMessage(phone, message, messageType, selectedId);
        logger.info('✅ Message handled');
      }
    }
  },

  async poll() {
    if (isPolling) return;
    isPolling = true;

    try {
      const notification = await this.receiveNotification();
      
      if (notification && notification.receiptId) {
        logger.info('📩 Received notification:', notification.body?.typeWebhook);
        await this.processNotification(notification);
        await this.deleteNotification(notification.receiptId);
      }
    } catch (error) {
      logger.error('Poll cycle error:', error.message);
    } finally {
      isPolling = false;
    }
  },

  start(intervalMs = 3000) {
    logger.info('🔄 Starting polling service...');
    
    // Clear webhook URL to enable polling
    this.clearWebhook().then(() => {
      // Start polling loop
      pollInterval = setInterval(() => this.poll(), intervalMs);
      logger.info(`✅ Polling active (every ${intervalMs}ms)`);
    });
  },

  stop() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      logger.info('⏹️ Polling stopped');
    }
  },

  async clearWebhook() {
    try {
      const { baseUrl, token } = getConfig();
      await axios.post(`${baseUrl}/setSettings/${token}`, {
        webhookUrl: '',
        incomingWebhook: 'no'
      });
      logger.info('🔧 Webhook URL cleared for polling mode');
      // Wait for settings to apply
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('Clear webhook error:', error.message);
    }
  }
};

module.exports = polling;
