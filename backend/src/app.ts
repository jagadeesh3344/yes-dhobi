import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { ridersRouter } from './modules/riders/riders.routes.js';
import { vendorsRouter } from './modules/vendors/vendors.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { getSettings } from './services/settings.js';
import { HttpError } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  // vendor registration ships base64 documents inline, hence the generous limit
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req: { url?: string }) => req.url === '/health' },
        // one compact line per request instead of full header dumps
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ status: res.statusCode }),
        },
        customSuccessMessage: (req: { method?: string; url?: string }, res: { statusCode: number }) => `${req.method} ${req.url} -> ${res.statusCode}`,
        customErrorMessage: (req: { method?: string; url?: string }, res: { statusCode: number }) => `${req.method} ${req.url} -> ${res.statusCode}`,
      }),
    );
  }

  app.get('/health', async (_req, res) => {
    res.json({ status: 'ok', service: 'yesdhobi-api', time: new Date().toISOString() });
  });
  app.get('/', (_req, res) => res.json({ name: 'Yes Dhobi API', docs: '/api/v1', health: '/health' }));

  // static uploads (local storage driver)
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), { maxAge: '7d' }));

  const api = express.Router();
  api.use(apiLimiter);

  // maintenance mode blocks customer-facing writes; admins keep working
  api.use(async (req, _res, next) => {
    if (req.method === 'GET' || req.path.startsWith('/admin') || req.path.startsWith('/auth/admin')) return next();
    const s = await getSettings();
    if (s.maintenanceMode) {
      return next(new HttpError(503, 'MAINTENANCE', 'Yes Dhobi is under maintenance. Please try again shortly.'));
    }
    next();
  });

  api.use('/auth', authRouter);
  api.use('/catalog', catalogRouter);
  api.use('/customers', customersRouter);
  api.use('/orders', ordersRouter);
  api.use('/riders', ridersRouter);
  api.use('/vendors', vendorsRouter);
  api.use('/support', supportRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/payments', paymentsRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/admin', adminRouter);

  api.get('/', (_req, res) => {
    res.json({
      version: 'v1',
      modules: ['auth', 'catalog', 'customers', 'orders', 'riders', 'vendors', 'support', 'notifications', 'payments', 'uploads', 'admin'],
      realtime: '/socket.io (auth: { token })',
    });
  });

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
