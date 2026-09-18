# Yes Dhobi Backend

One API + realtime server for all four Yes Dhobi frontends. Lives in `backend/` of this repo (`jagadeesh3344/yes-dhobi`); the vendor website is at the repo root.

| # | Frontend | Repo | Status |
| --- | --- | --- | --- |
| 1 | Customer app (Flutter) | `testyesdhobi-maker/yesdhobi_customer` | every screen covered → §3.1 |
| 2 | Rider + Vendor app (Flutter) | `testyesdhobi-maker/yesdhobi_ridervendor` | every screen covered → §3.2 / §3.3 |
| 3 | Vendor web registration (React) | `jagadeesh3344/yes-dhobi` (repo root) | works **without code changes** (same URL + payload) → §3.4 |
| 4 | Admin panel (React) | `jagadeesh3344/Yes-dhobi-admin-panel` | every page & modal covered, responses match `types.ts` → §3.5 |

**Stack:** Node 22 · TypeScript · Express · Prisma · PostgreSQL · Socket.IO · Zod · JWT.
**Tests:** 28 integration tests (`npm test`) walk the full order lifecycle across all roles plus every frontend payload shape.

---

## 1. Run it locally (10 minutes)

### 1.1 Prerequisites
* Node 20+ (`node -v`)
* PostgreSQL — pick **one** of the options in §2.

### 1.2 Steps
```bash
cd backend
npm install
cp .env.example .env            # defaults are fine for local dev

# start a database (see §2). Quickest without Docker:
npm run db:local                # keep this terminal open

# in a second terminal:
npm run prisma:migrate          # creates all tables
npm run db:seed                 # reference data + demo accounts
npm run dev                     # API on http://localhost:4000
```

Check it: open <http://localhost:4000/health> → `{"status":"ok"}`.

### 1.3 Seeded accounts (printed by the seed)
`OTP_DEV_MODE=true` (default) ⇒ **every OTP is 1234** and is also returned in API responses as `devOtp`.

| Role | Login |
| --- | --- |
| Admin | `admin@yesdhobi.com` / `Admin@12345` |
| Vendor — Star Bright Laundry (Bangalore) | phone `9123456789` / `Partner@123` |
| Vendor — Sai Ram Dry Cleaners | `9123456790` / `Partner@123` |
| Vendor — Krishna Dhobi Shop (Delhi) | `9123456791` / `Partner@123` |
| Rider — Rahul Yadav (online, HSR Layout) | `9876543210` / `Partner@123` |
| Rider — Sunil Kumar, Zack Colah | `9876543211`, `9876543212` / `Partner@123` |
| Customer — Rahul Sharma | phone `9876543000` → OTP `1234` |
| Customer — any new number | OTP `1234`, send `name` on verify |

Scripts: `npm run dev` · `npm test` · `npm run typecheck` · `npm run build && npm start` · `npm run prisma:studio` (DB browser) · `npm run db:reset` (wipe + migrate + seed).

---

## 2. PostgreSQL — the options

The API only needs a `DATABASE_URL`. All of these work unchanged.

| Option | When | `DATABASE_URL` |
| --- | --- | --- |
| **Embedded (no Docker)** `npm run db:local` | local dev on this laptop (Docker Desktop crashed on this machine) | `postgresql://yesdhobi:yesdhobi@localhost:5432/yesdhobi?schema=public` (already in `.env.example`) |
| **Docker** `docker compose up -d db` | local dev / CI | same as above |
| **Supabase** (recommended for staging + production) | hosted, free tier, backups, SQL editor | API: `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`  ·  migrations: same host on port `5432` **without** `pgbouncer=true` |
| **AWS RDS** | when you need VPC/IAM isolation or big scale | `postgresql://<user>:<pw>@<rds-endpoint>:5432/yesdhobi?schema=public` |
| **Render / Railway / Neon Postgres** | any managed Postgres | their connection string |

Supabase specifics:
1. Create a project → *Project Settings → Database* → copy the **Transaction pooler** URI (port 6543) into `DATABASE_URL` on the API host, and the **Direct** URI (port 5432) into `DIRECT_URL`-style usage when running `npx prisma migrate deploy` (just export `DATABASE_URL` to the direct URI for that one command).
2. Run `npx prisma migrate deploy` then `npm run db:seed` once.
3. Optional file storage: *Storage → create bucket `uploads` (public)* → *Settings → S3 access keys* → set `S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`, `S3_REGION=<region>`, `S3_BUCKET=uploads`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL=https://<ref>.supabase.co/storage/v1/object/public/uploads`. Without `S3_*` files are stored on the server disk under `./uploads`.

Encoding note: the database must be UTF-8 (₹ symbols). Managed providers are; the embedded script forces it.

---

## 3. Frontend by frontend — what calls what, and where to set the URL

Base URL: `http://localhost:4000/api/v1` (Android emulator: `http://10.0.2.2:4000/api/v1`; a real phone on Wi-Fi: `http://<your-laptop-LAN-IP>:4000/api/v1`).
Auth header: `Authorization: Bearer <accessToken>`. Socket.IO: same host, `auth: { token }`.

### 3.1 Customer app (`yesdhobi_customer`)
Today the app is UI-only (no `http` package). Add to `pubspec.yaml`: `http` (or `dio`), `socket_io_client`, `shared_preferences` (token storage). Create `lib/services/api_client.dart` holding `baseUrl` and the bearer token. Then wire screens:

| Screen (lib/screens) | Endpoint(s) |
| --- | --- |
| `login_screen` (Send OTP) | `POST /auth/customer/request-otp { phone }` |
| `login_screen` → Continue with Google | `POST /auth/customer/google { idToken }` (needs `GOOGLE_CLIENT_ID`) |
| `otp_verification_screen` | `POST /auth/customer/verify-otp { phone, otp }` → store `accessToken`, `refreshToken`; `isNewUser` ⇒ go to register |
| `register_screen` | `POST /auth/customer/verify-otp { phone, otp, name, email, referralCode? }` then `POST /customers/me/addresses` |
| `home_screen` services grid ("From ₹39") | `GET /catalog/services` (`fromPrice`) |
| `home_screen` Available Coupons | `GET /catalog/promotions` |
| `home_screen` recent/active orders, Reorder | `GET /orders?status=active`, `POST /orders/:id/reorder` |
| `home_screen` Account → Edit Profile | `GET /customers/me`, `PATCH /customers/me` |
| `home_screen` Refer & Earn | `GET /customers/me/referrals` (code + bonus from `GET /catalog/config`) |
| `home_screen` search bar | `GET /catalog/items?q=` |
| `select_items_screen` (replaces `CartManager` catalog) | `GET /catalog/items` (codes `wf_1`, `wi_3`… are the same ids the app uses) |
| `schedule_pickup_screen` / `order_scheduling_screen` | `GET /catalog/slots`, `GET /customers/me/addresses` |
| `manage_addresses_screen` | `GET/POST /customers/me/addresses`, `PATCH/DELETE /customers/me/addresses/:id` |
| `order_summary_screen` bill, coupon, express toggle | `POST /orders/quote { items, promoCode, isExpress }`, `POST /orders/validate-coupon` |
| `order_summary_screen` Place Order | `POST /orders { items, addressId, pickupDate, pickupSlot, isExpress, promoCode, paymentMethod: UPI/CARD/COD/WALLET, notes }` |
| Pay online | `POST /payments/intent { orderId, method }` → gateway → `POST /payments/:id/confirm` |
| `order_success_screen` | response of `POST /orders` (`orderNumber`, `deliveryEta`) |
| `track_order_screen` | `GET /orders/:id/track` (`tracking[]`, `rider`, `otps.pickup/delivery`) + socket `order:subscribe`, events `order:updated`, `rider:location` |
| `order_details_screen` Download Invoice | `GET /orders/:id/invoice` (JSON; render or convert to PDF in-app) |
| `order_details_screen` rating | `POST /orders/:id/rate` |
| Cancel order | `POST /orders/:id/cancel` |
| Wallet | `GET /customers/me/wallet`, `POST /customers/me/wallet/topup` |
| `help_support_screen` FAQs / Call / WhatsApp / Live chat | `GET /support/faqs?q=`, `GET /support/channels`, `POST /support/tickets`, `POST /support/tickets/:id/messages` |
| Notifications | `GET /notifications`, socket `notification:new`; push: `POST /auth/device-token` |

### 3.2 Rider portal (`yesdhobi_ridervendor`, rider screens)

| Screen | Endpoint(s) |
| --- | --- |
| `rider_login_screen` | `POST /auth/rider/login { phone, password }`; Forgot → `POST /auth/rider/forgot-password`, `POST /auth/rider/reset-password` |
| `rider_register_step1` | `POST /auth/rider/register { fullName, mobileNumber, email, password, dateOfBirth }` (returns token) |
| `rider_register_step2` | `PUT /riders/me/vehicle { vehicleType: "Scooter", vehicleNumber, drivingLicenseNumber, drivingLicensePhoto }` |
| `rider_register_step3` | `PUT /riders/me/documents { aadhaarFront, aadhaarBack, aadhaarNumber, panNumber, bankAccountNumber, ifscCode, profilePhoto }` → status `UNDER_REVIEW` |
| `application_review_screen` | `GET /riders/me/onboarding` (poll or socket `notification:new` when approved) |
| `identity_verification_*`, `front_camera_selfie`, `selfie_confirmation` | `POST /riders/me/selfie { image: dataUrl }` |
| `rider_dashboard_screen` Go Online / Offline | `POST /riders/me/availability { availability }`; stats `GET /riders/me/dashboard` |
| Incoming pickup requests (with countdown) | socket `pickup_request:new` / `pickup_request:expired`; `GET /riders/me/requests` (`remainingSeconds`) |
| `order_request_screen` Accept / Reject & Next | `POST /riders/me/requests/:id/accept`, `/decline` |
| `rider_order_details_screen`, Navigate | `GET /riders/me/orders/:id` (`pickup`, `dropoff` coords) |
| `confirm_pickup_screen` (weigh / count load) | `POST /riders/me/orders/:id/weigh { weightKg, itemsCount, photo? }` |
| `pickup_verification_screen` (customer OTP) | `POST /riders/me/orders/:id/confirm-pickup { otp }` |
| `confirm_vendor_dropoff_screen` (vendor OTP) | `POST /riders/me/orders/:id/confirm-dropoff { otp }` |
| Delivery leg: collect from vendor / deliver | `confirm-handover { otp }`, `confirm-delivery { otp, collectedCash }` |
| Live location while on a job | `POST /riders/me/location { lat, lng }` every ~10 s |
| `order_status_screen`, `order_history_screen` | `GET /riders/me/orders?status=active` / `history` |
| `rider_earnings_screen`, Withdraw | `GET /riders/me/earnings`, `POST /riders/me/payouts`, `GET /riders/me/payouts` |
| `rider_profile_screen`, Logout | `GET /riders/me`, `PATCH /riders/me`, `POST /auth/logout` |

Files/photos: send a base64 data URL in the field, or upload first with `POST /uploads` (multipart `files`) and send the returned `url`.

### 3.3 Vendor portal (`yesdhobi_ridervendor`, vendor screens)

| Screen | Endpoint(s) |
| --- | --- |
| `vendor_login_screen` | `POST /auth/vendor/login`; Forgot → `/auth/vendor/forgot-password` + `/reset-password`; "Register on Web" → the web app (§3.4) |
| `vendor_home_screen` stats, Services & Rates | `GET /vendors/me/dashboard`, `GET /vendors/me/services`, `POST /vendors/me/services`, `PATCH /vendors/me/services/:id` (price / unit / enable), `DELETE` (custom) |
| `vendor_new_orders_screen` Accept / Reject | `GET /vendors/me/orders?tab=new`, `POST /vendors/me/orders/:id/accept`, `/reject { reason }` |
| `vendor_active_orders_screen` tabs | `?tab=in_progress` / `ready` / `out_for_delivery` / `completed` |
| `vendor_order_details_screen` stage buttons | `POST /vendors/me/orders/:id/status { status: WASHING/IRONING/QUALITY_CHECK/READY }` |
| "Book rider" / package ready | `POST /vendors/me/orders/:id/book-rider` (marks READY, offers delivery to riders) |
| `vendor_rider_booked_screen` (shows handover OTP) | `GET /vendors/me/orders/:id` → `otps.riderHandover`, `isRiderBooked`, `deliveryRider`; socket `order:updated` flips to OUT_FOR_DELIVERY when the rider enters it |
| Rider drop-off OTP (rider arriving with clothes) | `otps.riderDrop` on the same response |
| `vendor_earnings_screen`, Request early payout | `GET /vendors/me/earnings`, `POST /vendors/me/payouts { amount? }` |
| `vendor_profile_screen` Edit shop, Logout | `GET /vendors/me`, `PATCH /vendors/me`, `POST /auth/logout` |

### 3.4 Vendor web registration (`yes-dhobi`)
Already calls `POST https://yesdhobi-api.onrender.com/api/v1/vendors` (with a `/api/v1/vendors` Vite-proxy fallback). This API implements that route with the exact payload from `src/utils/vendorApi.ts` (numeric `serviceId` 1‑9, `equipmentId` 1‑9, `serviceAreas` zone ids 1‑10, weekday numbers, base64 document URLs) and returns `{ registrationId, vendorId, status }` which `Step5DocumentsVerification.tsx` reads.

**Where to set the URL**
* Local test: `src/utils/vendorApi.ts` line 3 → `export const PRIMARY_API_ENDPOINT = 'http://localhost:4000/api/v1/vendors';` **or** `vite.config.ts` → `proxy['/api/v1/vendors'].target = 'http://localhost:4000'`.
* Production: deploy this backend to Render as `yesdhobi-api` (Dockerfile provided) and nothing in the web repo needs to change.

After submitting, the vendor gets an SMS (console in dev) with a temporary password for the partner app; the shop appears in the admin **Verifications** queue and becomes `ACTIVE` on approval.

### 3.5 Admin panel (`Yes-dhobi-admin-panel`)
The panel keeps all state in `src/context/DataContext.tsx` (localStorage). Replace each `initial*` array with a fetch and each mutation with a request; responses already match `src/types.ts`.

**Where to set the URL:** create `src/lib/api.ts` with `const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'` and a `fetch` wrapper that adds `Authorization: Bearer` from localStorage. Add `VITE_API_URL=http://localhost:4000/api/v1` to `.env`.

| Page / modal | Endpoint(s) |
| --- | --- |
| `Login` | `POST /auth/admin/login`; Forgot → `POST /auth/admin/forgot-password { email }`, `POST /auth/admin/reset-password { email, otp, newPassword }` |
| `Dashboard` KPIs, live feed | `GET /admin/dashboard`, `GET /admin/live/riders`, socket `order:updated`, `rider:location`, `notification:new` (replaces the "live simulation" interval) |
| `Orders` list/search | `GET /admin/orders?search=&status=Pending Pickup,Assigned&active=true` |
| `OrderModal` create / edit | `POST /admin/orders` and `PATCH /admin/orders/:id` — accept the modal's own fields: `customerName, customerPhone, customerAddress, partnerName, riderName, serviceName, itemsCount, itemDetails, amount, status, pickupDate, deliveryDate, paymentMethod (UPI/Card/COD/Wallet), paymentStatus, notes` |
| `updateOrderStatus`, `assignRiderToOrder`, `assignPartnerToOrder`, `deleteOrder` | `POST /admin/orders/:id/status { status }`, `/assign-rider { riderId }`, `/assign-vendor { vendorId }`, `DELETE /admin/orders/:id` |
| `Customers` + `CustomerModal` | `GET/POST /admin/customers`, `PATCH/DELETE /admin/customers/:id`, `POST /admin/customers/:id/wallet` |
| `Vendors` + `VendorModal`, toggle status | `GET/POST /admin/vendors`, `PATCH /admin/vendors/:id { status: "Suspended" }`, `DELETE` |
| `Riders` + `RiderModal`, toggle status | `GET/POST /admin/riders`, `PATCH /admin/riders/:id { status: "Online" }`, `DELETE` |
| `Services` + `ServiceModal` / `SurchargeModal` | `GET/POST /admin/services`, `PATCH`, `POST /admin/services/:id/toggle`; same under `/admin/surcharges` |
| `Promotions` + `PromoModal` | `GET/POST /admin/promotions`, `PATCH /admin/promotions/:code`, `/toggle`, `DELETE` |
| `Verifications` + `VerificationModal` / `RejectKYCModal` | `GET /admin/verifications?status=PENDING_REVIEW`, `POST /admin/verifications/:id/approve`, `/reject { reason }` |
| `Support` + `SupportTicketModal` / `NewTicketModal` | `GET /admin/tickets`, `POST /admin/tickets/:id/reply { text }`, `PATCH /admin/tickets/:id { status, priority }`, `POST /admin/tickets` |
| `Revenue` charts + payouts | `GET /admin/analytics/revenue?range=30d`, `GET /admin/payouts`, `GET /admin/payouts/outstanding`, `POST /admin/payouts`, `POST /admin/payouts/:id/process` |
| `Settings` + `ZoneModal` | `GET/PATCH /admin/settings`, `GET/POST /admin/zones { name, city, status: Operational/Paused }`, `PATCH/DELETE /admin/zones/:id`; admins: `GET/POST /admin/admins` |
| `BroadcastModal` | `POST /admin/broadcast { targetAudience: All/Customers/Riders/Vendors, priority, title, message }` |
| Notifications bell | `GET /notifications`, `POST /notifications/:id/read`, `/read-all` |

Two order status labels are new to the panel and should be added to its `OrderStatus` union: **Picked Up**, **Quality Check**. `exportCsv` and `resetToFactoryDemo` stay client-side.

---

## 4. How the business flow works (all four apps together)

```
customer places order ──► nearest ACTIVE vendor auto-assigned ──► vendor "New Requests" (accept/reject)
        │
        └─► pickup OFFER to online riders (45 s) ──► rider accepts ──► ASSIGNED
rider at door: weigh (optional) → enters customer's pickup OTP ──► PICKED_UP
rider at shop: enters vendor's drop OTP ──► IN_LAUNDRY  (rider earns pickup payout)
vendor: WASHING → IRONING → QUALITY_CHECK → READY + book rider ──► delivery OFFER to riders
delivery rider: enters vendor's handover OTP ──► OUT_FOR_DELIVERY
at customer: enters customer's delivery OTP ──► DELIVERED  (vendor & rider earnings booked, COD marked paid)
vendor / rider: request payout ──► admin processes ──► ledger settled
```

Money: `total = subtotal + surcharges (express/Sunday/heavy-load rules) + deliveryFee (free above ₹120) − coupon + tax`. Vendor earns `subtotal × (1 − commission%)`; riders earn `riderBaseFee + perKm × distance` per leg. All tunable in **Admin → Settings** and **Services → Surcharges**.

---

## 5. Testing

### 5.1 Automated (what CI should run)
```bash
npm run typecheck
npm test            # 28 integration tests against DATABASE_URL (needs a seeded DB)
```
`tests/lifecycle.test.ts` – OTP signup → order → rider offer → 4 OTP handoffs → delivered → rating → payout → admin KPIs; vendor web registration → KYC approval; rider onboarding.
`tests/frontend-contracts.test.ts` – exact admin-modal payloads, customer coupons/search/invoice/reorder, rider selfie.

### 5.2 Manual walk-through with curl (dev server running)
```bash
B=http://localhost:4000/api/v1

# 1. customer login
curl -s -X POST $B/auth/customer/request-otp -H 'Content-Type: application/json' -d '{"phone":"9876543000"}'
CT=$(curl -s -X POST $B/auth/customer/verify-otp -H 'Content-Type: application/json' -d '{"phone":"9876543000","otp":"1234"}' | jq -r .accessToken)

# 2. quote + place order (COD, coupon)
ADDR=$(curl -s $B/customers/me/addresses -H "Authorization: Bearer $CT" | jq -r '.data[0].id')
curl -s -X POST $B/orders/quote -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d '{"items":[{"code":"wi_1","quantity":2}],"promoCode":"FIRST20"}'
ORDER=$(curl -s -X POST $B/orders -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"code\":\"wi_1\",\"quantity\":2}],\"addressId\":\"$ADDR\",\"pickupDate\":\"2026-09-20\",\"pickupSlot\":\"6-8 PM\",\"paymentMethod\":\"COD\"}")
OID=$(echo $ORDER | jq -r .id); PICK_OTP=$(echo $ORDER | jq -r .otps.pickup); DEL_OTP=$(echo $ORDER | jq -r .otps.delivery)

# 3. rider accepts the offer and picks up
RT=$(curl -s -X POST $B/auth/rider/login -H 'Content-Type: application/json' -d '{"phone":"9876543210","password":"Partner@123"}' | jq -r .accessToken)
REQ=$(curl -s $B/riders/me/requests -H "Authorization: Bearer $RT" | jq -r '.data[0].requestId')
curl -s -X POST $B/riders/me/requests/$REQ/accept -H "Authorization: Bearer $RT"
curl -s -X POST $B/riders/me/orders/$OID/confirm-pickup -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d "{\"otp\":\"$PICK_OTP\"}"

# 4. vendor accepts, rider drops off with vendor OTP
VT=$(curl -s -X POST $B/auth/vendor/login -H 'Content-Type: application/json' -d '{"phone":"9123456789","password":"Partner@123"}' | jq -r .accessToken)
curl -s -X POST $B/vendors/me/orders/$OID/accept -H "Authorization: Bearer $VT"
DROP=$(curl -s $B/vendors/me/orders/$OID -H "Authorization: Bearer $VT" | jq -r .otps.riderDrop)
curl -s -X POST $B/riders/me/orders/$OID/confirm-dropoff -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d "{\"otp\":\"$DROP\"}"

# 5. vendor processes and books a delivery rider; rider delivers
curl -s -X POST $B/vendors/me/orders/$OID/status -H "Authorization: Bearer $VT" -H 'Content-Type: application/json' -d '{"status":"WASHING"}'
curl -s -X POST $B/vendors/me/orders/$OID/book-rider -H "Authorization: Bearer $VT"
REQ=$(curl -s $B/riders/me/requests -H "Authorization: Bearer $RT" | jq -r '.data[0].requestId')
curl -s -X POST $B/riders/me/requests/$REQ/accept -H "Authorization: Bearer $RT"
HAND=$(curl -s $B/vendors/me/orders/$OID -H "Authorization: Bearer $VT" | jq -r .otps.riderHandover)
curl -s -X POST $B/riders/me/orders/$OID/confirm-handover -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d "{\"otp\":\"$HAND\"}"
curl -s -X POST $B/riders/me/orders/$OID/confirm-delivery -H "Authorization: Bearer $RT" -H 'Content-Type: application/json' -d "{\"otp\":\"$DEL_OTP\",\"collectedCash\":true}"

# 6. admin view
AT=$(curl -s -X POST $B/auth/admin/login -H 'Content-Type: application/json' -d '{"email":"admin@yesdhobi.com","password":"Admin@12345"}' | jq -r .accessToken)
curl -s $B/admin/orders/$OID -H "Authorization: Bearer $AT" | jq '{displayId,statusLabel,customerName,partnerName,riderName,amount}'
curl -s $B/admin/dashboard -H "Authorization: Bearer $AT" | jq .kpis
```
(Windows without `jq`: use Postman/Insomnia — import the calls above, or run `npm test` which does the same.)

### 5.3 Testing the vendor website against this backend
1. `cd frontends/web && npm install && npm run dev` (port 3000).
2. Point it at the API (§3.4), fill the 5-step form, submit → success screen shows the `registrationId`.
3. Admin: `GET /admin/verifications?status=PENDING_REVIEW` → approve → vendor can log in to the partner app with the SMSed temporary password (visible in the API console log in dev).

### 5.4 Testing the Flutter apps
Run the API with `CORS_ORIGINS=*` and `PUBLIC_BASE_URL=http://<LAN-IP>:4000` (so uploaded image URLs open on the phone), use `http://10.0.2.2:4000/api/v1` on the Android emulator. Use the seeded rider/vendor accounts; OTP is `1234`.

---

## 6. Deployment

### 6.1 Recommendation: Supabase (database + storage) + Render (API)
1. Supabase project → copy pooler URI (§2).
2. Render → *New Web Service* → this repo, Docker runtime, name it `yesdhobi-api` (the web app already points to `yesdhobi-api.onrender.com`).
3. Environment variables (Render → Environment):
   ```
   NODE_ENV=production
   DATABASE_URL=<supabase pooler uri>
   JWT_ACCESS_SECRET=<32+ random chars>   JWT_REFRESH_SECRET=<32+ random chars>
   OTP_DEV_MODE=false      SMS_PROVIDER=msg91 (after implementing it in src/services/sms.ts)
   CORS_ORIGINS=https://yesdhobi.com,https://admin.yesdhobi.com
   PUBLIC_BASE_URL=https://yesdhobi-api.onrender.com
   S3_*                     (optional, Supabase Storage — §2)
   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
   ```
4. Once: `npx prisma migrate deploy` with the **direct** DB URI, then `npm run db:seed` (or use the Render shell).
5. Deploy the admin panel & vendor site to Vercel/Netlify with `VITE_API_URL` pointing at the API.

### 6.2 AWS instead
RDS Postgres (`DATABASE_URL`), S3 (`S3_REGION`, `S3_BUCKET`, IAM keys; no `S3_ENDPOINT`), container on App Runner/ECS from the `Dockerfile`. Same code. Choose it when you need VPC isolation/IAM, or beyond ~10k orders/day; otherwise it costs more (RDS + Fargate ≳ $50/mo) and takes more setup than Supabase. Migration later = `pg_dump` + bucket sync.

### 6.3 Docker (self-host)
`docker compose up --build` → Postgres + API on :4000 (runs `prisma migrate deploy` on boot; seed once with `docker compose exec api npx tsx prisma/seed.ts`).

---

## 7. Conventions & realtime

* Success → resource JSON; lists → `{ data, pagination:{page,limit,total,totalPages} }` (`?page=&limit=`).
* Errors → `{ error:{code,message,details?}, message }`; 400 validation, 401/403 auth, 404, 409 conflict, 422 business rule, 429 rate-limited, 503 maintenance.
* Money = JSON numbers (₹), dates ISO-8601, phones stored E.164 (send 10 digits, we normalise).
* Access token 15 min, refresh 30 days (`POST /auth/refresh`).

| Socket event (server → client) | Who | 
| --- | --- |
| `order:updated` | customer, vendor, riders on the order, admins, `order:{id}` subscribers |
| `pickup_request:new`, `pickup_request:expired` | rider |
| `rider:location`, `rider:availability` | admins; `order:{id}` room |
| `notification:new` | user |
| `ticket:new`, `ticket:message` | admins / ticket owner |

Client → server: `order:subscribe <orderId>`, `order:unsubscribe`, `zone:subscribe <zoneId>`.

---

## 8. Next steps (in priority order)

1. **Wire the frontends** (§3) – start with the vendor site (one-line URL change), then the admin panel `DataContext.tsx`, then the Flutter apps.
2. **SMS provider** – implement MSG91/Twilio in `src/services/sms.ts`; set `OTP_DEV_MODE=false`.
3. **Payment gateway** – Razorpay/PhonePe in `src/modules/payments/payments.routes.ts` (create provider order in `intent`, verify signature in `confirm`, handle `webhook`).
4. **Push notifications** – FCM send in `src/services/notifications.ts` using stored `DeviceToken`s (socket delivery already works).
5. **Email** – Resend/SES in `src/services/mailer.ts` (admin resets, vendor approvals, invoices).
6. **Google sign-in** – set `GOOGLE_CLIENT_ID`.
7. **PDF invoices** – `GET /orders/:id/invoice` returns JSON today; add `pdfkit` if a file download is required.
8. **Maps** – add a distance/ETA provider (Google Distance Matrix) in `orders.service.ts` where `distanceKm` is computed by Haversine.
9. **Ops** – add Sentry/Logtail, uptime check on `/health`, nightly `pg_dump` (Supabase does this automatically).

---

## 9. Project layout

```
prisma/schema.prisma       36 tables · prisma/seed.ts · prisma/migrations/
src/app.ts                 Express wiring · src/server.ts bootstrap + Socket.IO + dispatch sweeper
src/config/env.ts          validated env
src/lib/                   prisma client, errors, http helpers, ids (sequences), utils
src/middleware/            auth (JWT + roles), rate limits, error handler
src/services/              otp, sms, mailer, tokens, storage (local/S3), settings, pricing,
                           orders (state machine + serializers), dispatch (rider offers),
                           ledger (earnings/payouts), notifications
src/realtime/socket.ts     Socket.IO rooms & auth
src/modules/               auth, catalog, customers, orders, riders, vendors (+ web registration),
                           payments, support, notifications, uploads, admin/* (orders, people,
                           catalog, ops, dashboard)
tests/                     lifecycle.test.ts · frontend-contracts.test.ts
scripts/local-db.ts        embedded PostgreSQL for Docker-less development
Dockerfile · docker-compose.yml
```
