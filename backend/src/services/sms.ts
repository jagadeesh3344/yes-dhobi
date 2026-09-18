import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

/** Default provider: logs the message. Swap in MSG91 / Twilio for production. */
const consoleProvider: SmsProvider = {
  async send(to, message) {
    logger.info({ to, message }, '[SMS]');
  },
};

// Placeholders wired to env so that switching providers is a config change.
// Implement with the vendor SDK / REST API of your choice.
const msg91Provider: SmsProvider = {
  async send(to, message) {
    logger.warn({ to }, 'MSG91 provider not configured, falling back to console');
    await consoleProvider.send(to, message);
  },
};

const twilioProvider: SmsProvider = {
  async send(to, message) {
    logger.warn({ to }, 'Twilio provider not configured, falling back to console');
    await consoleProvider.send(to, message);
  },
};

export const sms: SmsProvider =
  env.SMS_PROVIDER === 'msg91' ? msg91Provider : env.SMS_PROVIDER === 'twilio' ? twilioProvider : consoleProvider;
