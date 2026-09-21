import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Email abstraction: console locally, AWS SES in production
 * (MAIL_PROVIDER=ses; MAIL_FROM must be a verified SES identity).
 */
export interface MailProvider {
  send(to: string, subject: string, text: string): Promise<void>;
}

const consoleMailer: MailProvider = {
  async send(to, subject, text) {
    logger.info({ to, subject, text }, '[MAIL]');
  },
};

let sesClient: SESClient | null = null;
const sesMailer: MailProvider = {
  async send(to, subject, text) {
    sesClient ??= new SESClient({ region: env.AWS_REGION });
    await sesClient.send(
      new SendEmailCommand({
        Source: env.MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Message: { Subject: { Data: subject }, Body: { Text: { Data: text } } },
      }),
    );
  },
};

export const mailer: MailProvider = env.MAIL_PROVIDER === 'ses' ? sesMailer : consoleMailer;
