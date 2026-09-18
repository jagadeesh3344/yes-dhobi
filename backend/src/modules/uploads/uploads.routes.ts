import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { badRequest } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { saveBuffer, saveDataUrl } from '../../services/storage.js';

/** Generic file upload for KYC docs, selfies, shop photos. */
export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 5 } });

/** multipart/form-data with one or more `files` fields (+ optional `folder`). */
uploadsRouter.post(
  '/',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('No files received. Send multipart/form-data with a `files` field.');
    const folder = typeof req.body?.folder === 'string' ? req.body.folder : `${req.user!.role.toLowerCase()}s/${req.user!.id}`;
    const stored = await Promise.all(files.map((f) => saveBuffer(f.buffer, f.mimetype, folder)));
    res.status(201).json({ data: stored });
  }),
);

/** JSON body { dataUrl: "data:image/jpeg;base64,..." } for clients that prefer base64. */
uploadsRouter.post(
  '/base64',
  asyncHandler(async (req, res) => {
    const { dataUrl, folder } = parseBody(z.object({ dataUrl: z.string().min(30), folder: z.string().optional() }), req.body);
    res.status(201).json(await saveDataUrl(dataUrl, folder ?? `${req.user!.role.toLowerCase()}s/${req.user!.id}`));
  }),
);
