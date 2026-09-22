import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default('*'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),

  OTP_DEV_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  // console | sns (AWS SNS) | msg91 | twilio
  SMS_PROVIDER: z.enum(['console', 'sns', 'msg91', 'twilio']).default('console'),
  SMS_SENDER_ID: z.string().default('YESDHB'),
  // India (TRAI DLT): entity id registered with the operator, and a template id per message type
  SMS_DLT_ENTITY_ID: z.string().optional(),
  SMS_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  // console | ses (AWS SES)
  MAIL_PROVIDER: z.enum(['console', 'ses']).default('console'),
  MAIL_FROM: z.string().default('Yes Dhobi <no-reply@yesdhobi.com>'),
  AWS_REGION: z.string().optional(),

  PICKUP_REQUEST_TTL_SECONDS: z.coerce.number().default(45),
  DISPATCH_RADIUS_KM: z.coerce.number().default(8),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(8),

  // Optional S3 object storage (AWS S3; any S3-compatible endpoint also works)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().default('admin@yesdhobi.com'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd && env.OTP_DEV_MODE) {
  console.warn('WARNING: OTP_DEV_MODE is enabled in production. Every OTP is 1234.');
}
