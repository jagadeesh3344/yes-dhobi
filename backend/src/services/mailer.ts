import { logger } from '../lib/logger.js';

/**
 * Minimal email abstraction. The default provider logs to the console; wire
 * up Resend / SES / SendGrid here for production (admin password resets,
 * invoices, vendor approval mails).
 */
export interface MailProvider {
  send(to: string, subject: string, text: string): Promise<void>;
}

const consoleMailer: MailProvider = {
  async send(to, subject, text) {
    logger.info({ to, subject, text }, '[MAIL]');
  },
};

export const mailer: MailProvider = consoleMailer;
