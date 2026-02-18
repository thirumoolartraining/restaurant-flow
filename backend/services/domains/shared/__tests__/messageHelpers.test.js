/**
 * Message Helpers Unit Tests - Phase 6.2
 */

// Mock WhatsApp service
jest.mock('../../../whatsapp', () => ({
  sendMessage: jest.fn(),
  sendButtons: jest.fn(),
  sendImage: jest.fn(),
  sendImageWithButtons: jest.fn(),
  sendList: jest.fn(),
  sendCtaUrl: jest.fn(),
  sendImageWithCtaUrl: jest.fn()
}));

const whatsapp = require('../../../whatsapp');
const messageHelpers = require('../messageHelpers');

describe('Message Helpers', () => {
  const testPhone = '+919876543210';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('sendEmptyCartMessage', () => {
    it('should send message with menu button when includeMenuButton is true', async () => {
      await messageHelpers.sendEmptyCartMessage(testPhone, true);
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('empty'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'view_menu' }),
          expect.objectContaining({ id: 'home' })
        ])
      );
    });
    
    it('should send simple message when includeMenuButton is false', async () => {
      await messageHelpers.sendEmptyCartMessage(testPhone, false);
      
      expect(whatsapp.sendMessage).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendMessage).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('empty')
      );
    });
  });
  
  describe('sendWithOptionalImage', () => {
    it('should send image with buttons when imageUrl is provided', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const message = 'Test message';
      const buttons = [{ id: 'test', text: 'Test' }];
      
      await messageHelpers.sendWithOptionalImage(testPhone, imageUrl, message, buttons);
      
      expect(whatsapp.sendImageWithButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendImageWithButtons).toHaveBeenCalledWith(
        testPhone,
        imageUrl,
        message,
        buttons,
        ''
      );
    });
    
    it('should send buttons without image when imageUrl is null', async () => {
      const message = 'Test message';
      const buttons = [{ id: 'test', text: 'Test' }];
      
      await messageHelpers.sendWithOptionalImage(testPhone, null, message, buttons);
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        message,
        buttons,
        ''
      );
    });
  });
  
  describe('sendItemNotAvailableMessage', () => {
    it('should send item not available message with item name', async () => {
      await messageHelpers.sendItemNotAvailableMessage(testPhone, 'Pizza');
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('Pizza'),
        expect.any(Array)
      );
    });
    
    it('should send generic message when item name is not provided', async () => {
      await messageHelpers.sendItemNotAvailableMessage(testPhone);
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('not available'),
        expect.any(Array)
      );
    });
  });
  
  describe('sendSuccessMessage', () => {
    it('should send success message with default buttons', async () => {
      await messageHelpers.sendSuccessMessage(testPhone, 'Order placed');
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('✅'),
        expect.arrayContaining([
          expect.objectContaining({ id: 'view_menu' }),
          expect.objectContaining({ id: 'home' })
        ])
      );
    });
    
    it('should send success message with custom buttons', async () => {
      const customButtons = [{ id: 'custom', text: 'Custom' }];
      await messageHelpers.sendSuccessMessage(testPhone, 'Order placed', customButtons);
      
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('✅'),
        customButtons
      );
    });
  });
  
  describe('sendErrorMessage', () => {
    it('should send error message with default buttons', async () => {
      await messageHelpers.sendErrorMessage(testPhone, 'Something went wrong');
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('❌'),
        expect.any(Array)
      );
    });
  });
  
  describe('sendConfirmationMessage', () => {
    it('should send confirmation with yes/no buttons', async () => {
      await messageHelpers.sendConfirmationMessage(
        testPhone,
        'Are you sure?',
        'yes_id',
        'no_id'
      );
      
      expect(whatsapp.sendButtons).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendButtons).toHaveBeenCalledWith(
        testPhone,
        'Are you sure?',
        expect.arrayContaining([
          expect.objectContaining({ id: 'yes_id' }),
          expect.objectContaining({ id: 'no_id' })
        ])
      );
    });
  });
  
  describe('sendProcessingMessage', () => {
    it('should send processing message', async () => {
      await messageHelpers.sendProcessingMessage(testPhone, 'Loading');
      
      expect(whatsapp.sendMessage).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendMessage).toHaveBeenCalledWith(
        testPhone,
        expect.stringContaining('⏳')
      );
    });
  });
});
