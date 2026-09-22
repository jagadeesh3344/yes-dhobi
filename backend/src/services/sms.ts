import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * SMS delivery.
 *
 * Indian operators (TRAI DLT rules) do not accept free-form marketing-looking
 * text: the sender id and an approved *template* must be registered, and the
 * message is sent as template id + variables. So `send` takes both the plain
 * text (used by the console provider and by non-DLT destinations) and the
 * template metadata used by the real providers.
 *
 * Providers: console (default, logs), sns (AWS SNS), msg91 (India), twilio.
 * Switch with SMS_PROVIDER; no code change needed.
 */

export interface SmsMeta {
  /** DLT template id registered for this message type */
  templateId?: string;
  /** template variables, e.g. { otp: '1234', minutes: '5' } */
  vars?: Record<string, string>;
}

export interface SmsProvider {
  send(to: string, message: string, meta?: SmsMeta): Promise<void>;
}

/** Default provider: logs the message (local development / before go-live). */
const consoleProvider: SmsProvider = {
  async send(to, message) {
    logger.info({ to, message }, '[SMS]');
  },
};

/**
 * AWS SNS transactional SMS.
 * India: register the sender id with AWS (Text messaging -> Sender IDs) and set
 * SMS_DLT_ENTITY_ID plus the per-message template id, otherwise operators drop
 * the message.
 */
let snsClient: SNSClient | null = null;
const snsProvider: SmsProvider = {
  async send(to, message, meta) {
    snsClient ??= new SNSClient({ region: env.AWS_REGION });
    const attributes: Record<string, { DataType: string; StringValue: string }> = {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
      'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: env.SMS_SENDER_ID },
    };
    if (env.SMS_DLT_ENTITY_ID) attributes['AWS.MM.SMS.EntityId'] = { DataType: 'String', StringValue: env.SMS_DLT_ENTITY_ID };
    if (meta?.templateId) attributes['AWS.MM.SMS.TemplateId'] = { DataType: 'String', StringValue: meta.templateId };
    try {
      await snsClient.send(new PublishCommand({ PhoneNumber: to, Message: message, MessageAttributes: attributes }));
    } catch (err) {
      logger.error({ err, to }, 'SNS SMS failed');
      throw err;
    }
  },
};

/**
 * MSG91 (common choice in India; DLT registration is done inside their panel).
 * Needs MSG91_AUTH_KEY and a flow/template id per message type.
 * Variables are sent as named fields exactly as defined in the template.
 */
const msg91Provider: SmsProvider = {
  async send(to, message, meta) {
    const templateId = meta?.templateId ?? env.MSG91_OTP_TEMPLATE_ID;
    if (!env.MSG91_AUTH_KEY || !templateId) {
      logger.warn({ to }, 'MSG91 not configured (MSG91_AUTH_KEY / template id missing), logging instead');
      await consoleProvider.send(to, message);
      return;
    }
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: env.MSG91_AUTH_KEY },
      body: JSON.stringify({
        template_id: templateId,
        sender: env.SMS_SENDER_ID,
        short_url: '0',
        recipients: [{ mobiles: to.replace(/^\+/, ''), ...(meta?.vars ?? {}) }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ to, status: res.status, body }, 'MSG91 SMS failed');
      throw new Error(`MSG91 responded ${res.status}`);
    }
  },
};

/** Twilio (useful for non-Indian numbers / testing). */
const twilioProvider: SmsProvider = {
  async send(to, message) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
    if (!sid || !token || !from) {
      logger.warn({ to }, 'Twilio not configured (TWILIO_* missing), logging instead');
      await consoleProvider.send(to, message);
      return;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ to, status: res.status, body }, 'Twilio SMS failed');
      throw new Error(`Twilio responded ${res.status}`);
    }
  },
};

export const sms: SmsProvider =
  env.SMS_PROVIDER === 'sns'
    ? snsProvider
    : env.SMS_PROVIDER === 'msg91'
      ? msg91Provider
      : env.SMS_PROVIDER === 'twilio'
        ? twilioProvider
        : consoleProvider;
