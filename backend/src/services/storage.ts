import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * File storage abstraction.
 *  - default: local disk under UPLOAD_DIR, served at /uploads/...
 *  - when S3_BUCKET is set: AWS S3 (or any S3-compatible endpoint via S3_ENDPOINT)
 */

export interface StoredFile {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const ALLOWED_MIME = new Set(Object.keys(EXT_BY_MIME));
const MAX_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

const useS3 = Boolean(env.S3_BUCKET);
const s3 = useS3
  ? new S3Client({
      region: env.S3_REGION ?? 'auto',
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    })
  : null;

function buildKey(folder: string, ext: string): string {
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '') || 'misc';
  const date = new Date();
  const ymd = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${safeFolder}/${ymd}/${crypto.randomUUID()}.${ext}`;
}

export async function saveBuffer(buffer: Buffer, contentType: string, folder: string): Promise<StoredFile> {
  const mime = contentType.toLowerCase().split(';')[0]!.trim();
  if (!ALLOWED_MIME.has(mime)) throw badRequest(`Unsupported file type ${mime}. Allowed: JPG, PNG, WEBP, HEIC, PDF`);
  if (buffer.length > MAX_BYTES) throw badRequest(`File exceeds ${env.MAX_UPLOAD_MB}MB limit`);

  const key = buildKey(folder, EXT_BY_MIME[mime]!);

  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET!, Key: key, Body: buffer, ContentType: mime }));
    const base = env.S3_PUBLIC_URL?.replace(/\/$/, '') ?? `${env.S3_ENDPOINT?.replace(/\/$/, '')}/${env.S3_BUCKET}`;
    return { url: `${base}/${key}`, key, contentType: mime, size: buffer.length };
  }

  const abs = path.resolve(process.cwd(), env.UPLOAD_DIR, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${key}`, key, contentType: mime, size: buffer.length };
}

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,(.+)$/i;

export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && DATA_URL_RE.test(value.slice(0, 64) + (value.length > 64 ? 'x' : ''));
}

/** Persist a base64 data URL (as sent by the vendor web form) and return its public URL. */
export async function saveDataUrl(dataUrl: string, folder: string): Promise<StoredFile> {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw badRequest('Invalid data URL');
  const [, mime, b64] = match;
  return saveBuffer(Buffer.from(b64!, 'base64'), mime!, folder);
}

/**
 * Walk a `{ key: value }` document map: data URLs are uploaded and replaced with
 * URLs; http(s) URLs pass through; everything else is dropped.
 */
export async function materializeDocuments(
  docs: Record<string, unknown>,
  folder: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(docs)) {
    if (typeof value !== 'string' || !value) continue;
    if (value.startsWith('data:')) {
      try {
        out[key] = (await saveDataUrl(value, folder)).url;
      } catch (err) {
        logger.warn({ key, err }, 'Skipping document that failed to store');
      }
    } else if (/^https?:\/\//i.test(value)) {
      out[key] = value;
    }
  }
  return out;
}
