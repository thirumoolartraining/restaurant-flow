/**
 * Shared Message Helpers - Phase 6.1
 * 
 * Purpose: Extract common WhatsApp messaging patterns from domain handlers
 * Reduces code duplication across all domains
 * 
 * Common Patterns Extracted:
 * - Send message with optional image
 * - Send buttons with optional image
 * - Send list with optional image
 * - Send CTA URL with optional image
 * - Empty cart messages
 * - Error messages
 * - Success messages
 */

const whatsapp = require('../../whatsapp');

/**
 * Send message with optional image and buttons
 */
async function sendWithOptionalImage(phone, imageUrl, message, buttons, footer = '') {
  if (imageUrl) {
    await whatsapp.sendImageWithButtons(phone, imageUrl, message, buttons, footer);
  } else {
    await whatsapp.sendButtons(phone, message, buttons, footer);
  }
}

/**
 * Send message with optional image (no buttons)
 */
async function sendMessageWithOptionalImage(phone, imageUrl, message) {
  if (imageUrl) {
    await whatsapp.sendImage(phone, imageUrl, message);
  } else {
    await whatsapp.sendMessage(phone, message);
  }
}

/**
 * Send list with optional header image
 */
async function sendListWithOptionalImage(phone, imageUrl, title, message, sections, buttonText) {
  // WhatsApp lists don't support images directly, so send image first if available
  if (imageUrl) {
    await whatsapp.sendImage(phone, imageUrl, title);
  }
  await whatsapp.sendList(phone, title, message, sections, buttonText);
}

/**
 * Send CTA URL with optional image
 */
async function sendCtaWithOptionalImage(phone, imageUrl, message, buttonText, url, footer = '') {
  if (imageUrl) {
    await whatsapp.sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer);
  } else {
    await whatsapp.sendCtaUrl(phone, message, buttonText, url, footer);
  }
}

/**
 * Send empty cart message
 */
async function sendEmptyCartMessage(phone, includeMenuButton = true) {
  const message = '🛒 Your cart is empty. Add items first!';
  
  if (includeMenuButton) {
    await whatsapp.sendButtons(phone, message, [
      { id: 'view_menu', text: '📋 Browse Menu' },
      { id: 'home', text: '🏠 Main Menu' }
    ]);
  } else {
    await whatsapp.sendMessage(phone, message);
  }
}

/**
 * Send item not available message
 */
async function sendItemNotAvailableMessage(phone, itemName = null) {
  const message = itemName 
    ? `❌ ${itemName} is not available at the moment.`
    : '❌ Item not available.';
  
  await whatsapp.sendButtons(phone, message, [
    { id: 'view_menu', text: '📋 Browse Menu' },
    { id: 'home', text: '🏠 Main Menu' }
  ]);
}

/**
 * Send order not found message
 */
async function sendOrderNotFoundMessage(phone) {
  await whatsapp.sendButtons(phone, '❌ Order not found.', [
    { id: 'my_orders', text: '📦 My Orders' },
    { id: 'home', text: '🏠 Main Menu' }
  ]);
}

/**
 * Send generic error message with retry options
 */
async function sendErrorMessage(phone, errorText, retryButtons = []) {
  const message = `❌ ${errorText}`;
  
  const defaultButtons = [
    { id: 'home', text: '🏠 Main Menu' },
    { id: 'help', text: '❓ Help' }
  ];
  
  const buttons = retryButtons.length > 0 ? retryButtons : defaultButtons;
  
  await whatsapp.sendButtons(phone, message, buttons);
}

/**
 * Send success message with next action buttons
 */
async function sendSuccessMessage(phone, successText, nextActionButtons = []) {
  const message = `✅ ${successText}`;
  
  const defaultButtons = [
    { id: 'view_menu', text: '📋 Browse Menu' },
    { id: 'home', text: '🏠 Main Menu' }
  ];
  
  const buttons = nextActionButtons.length > 0 ? nextActionButtons : defaultButtons;
  
  await whatsapp.sendButtons(phone, message, buttons);
}

/**
 * Send confirmation message with yes/no buttons
 */
async function sendConfirmationMessage(phone, message, yesId, noId, yesText = '✅ Yes', noText = '❌ No') {
  await whatsapp.sendButtons(phone, message, [
    { id: yesId, text: yesText },
    { id: noId, text: noText }
  ]);
}

/**
 * Send loading/processing message
 */
async function sendProcessingMessage(phone, action = 'Processing') {
  await whatsapp.sendMessage(phone, `⏳ ${action}... Please wait.`);
}

module.exports = {
  sendWithOptionalImage,
  sendMessageWithOptionalImage,
  sendListWithOptionalImage,
  sendCtaWithOptionalImage,
  sendEmptyCartMessage,
  sendItemNotAvailableMessage,
  sendOrderNotFoundMessage,
  sendErrorMessage,
  sendSuccessMessage,
  sendConfirmationMessage,
  sendProcessingMessage
};
