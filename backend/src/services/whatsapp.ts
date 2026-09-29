import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * WhatsApp OTP through the Meta WhatsApp Cloud API.
 *
 * Unlike SMS, WhatsApp is NOT covered by TRAI's DLT rules - it runs on Meta's
 * platform. What it does need:
 *   - a Meta Business account with the business verified
 *   - a WhatsApp Business phone number (WHATSAPP_PHONE_NUMBER_ID)
 *   - a permanent access token (WHATSAPP_ACCESS_TOKEN)
 *   - an approved template of category AUTHENTICATION (WHATSAPP_OTP_TEMPLATE)
 *
 * Authentication templates take the code as the single body variable and, when
 * the template has a copy-code button, the same value again as the button
 * parameter - that is what Meta's format requires.
 */

export interface WhatsAppResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export const whatsappConfigured = () => Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_OTP_TEMPLATE);

/** Send a one-time code to an E.164 number. Never throws: returns ok:false so the caller can fall back to SMS. */
export async function sendWhatsAppOtp(to: string, code: string): Promise<WhatsAppResult> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp is not configured' };

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: env.WHATSAPP_OTP_TEMPLATE,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        // authentication templates include a one-tap "copy code" button
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) {
      const error = json.error?.message ?? `WhatsApp responded ${res.status}`;
      logger.error({ to, status: res.status, error }, 'WhatsApp OTP failed');
      return { ok: false, error };
    }
    return { ok: true, messageId: json.messages?.[0]?.id };
  } catch (err) {
    logger.error({ err, to }, 'WhatsApp OTP request failed');
    return { ok: false, error: (err as Error).message };
  }
}
