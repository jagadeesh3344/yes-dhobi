import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { adminOrdersRouter } from './orders.admin.js';
import { adminPeopleRouter } from './people.admin.js';
import { adminCatalogRouter } from './catalog.admin.js';
import { adminOpsRouter } from './ops.admin.js';
import { adminDashboardRouter } from './dashboard.admin.js';

/** Everything under /api/v1/admin requires an ADMIN token. */
export const adminRouter = Router();
adminRouter.use(...requireAdmin);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use(adminPeopleRouter); // /customers /riders /vendors
adminRouter.use(adminCatalogRouter); // /services /items /zones /equipments /promotions /surcharges
adminRouter.use(adminOpsRouter); // /verifications /tickets /faqs /payouts
adminRouter.use(adminDashboardRouter); // /dashboard /analytics /settings /broadcast /admins /live
