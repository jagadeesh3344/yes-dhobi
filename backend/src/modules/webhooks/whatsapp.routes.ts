import { Router } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export const whatsappWebhookRouter = Router();

/**
 * Meta WhatsApp Webhook Verification
 * When configuring the webhook in the Meta Developer Console, Meta sends an
 * HTTP GET request with hub.mode, hub.verify_token, and hub.challenge.
 */
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook successfully verified by Meta');
    return res.status(200).send(String(challenge));
  }

  logger.warn({ mode, token }, 'WhatsApp webhook verification token mismatch');
  return res.sendStatus(403);
});

/**
 * Meta WhatsApp Webhook Event Handler
 * Meta posts message delivery status (sent, delivered, read) and incoming messages here.
 */
whatsappWebhookRouter.post('/', (req, res) => {
  const body = req.body;

  // Log incoming events for tracking delivery status
  if (body?.entry) {
    for (const entry of body.entry) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        if (value.statuses) {
          for (const status of value.statuses) {
            logger.info(
              {
                messageId: status.id,
                recipientId: status.recipient_id,
                status: status.status,
                timestamp: status.timestamp,
              },
              'WhatsApp message status update',
            );
          }
        }
      }
    }
  }

  // Acknowledge receipt to Meta immediately (must be 200 within 20s or Meta retries)
  return res.status(200).send('EVENT_RECEIVED');
});
