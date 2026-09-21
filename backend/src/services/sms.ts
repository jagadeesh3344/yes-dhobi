import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface SmsProvider {
  send(to: string, message: string): Promise<void>;
}

/** Default provider: logs the message (local development). */
const consoleProvider: SmsProvider = {
  async send(to, message) {
    logger.info({ to, message }, '[SMS]');
  },
};

/**
 * AWS SNS transactional SMS. For Indian numbers register a DLT sender id /
 * template with your telecom operator and set SMS_SENDER_ID accordingly.
 */
let snsClient: SNSClient | null = null;
const snsProvider: SmsProvider = {
  async send(to, message) {
    snsClient ??= new SNSClient({ region: env.AWS_REGION });
    try {
      await snsClient.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: message,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
            'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: env.SMS_SENDER_ID },
          },
        }),
      );
    } catch (err) {
      logger.error({ err, to }, 'SNS SMS failed');
      throw err;
    }
  },
};

// Placeholders wired to env so that switching providers is a config change.
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
  env.SMS_PROVIDER === 'sns' ? snsProvider : env.SMS_PROVIDER === 'msg91' ? msg91Provider : env.SMS_PROVIDER === 'twilio' ? twilioProvider : consoleProvider;
