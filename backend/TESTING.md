# Yes Dhobi — Testing guide (for people who have never tested software)

Read Parts 0–4 once; they explain the system and how to prepare. Then do the **quick checks** in Part 5 (20 minutes) and, if they pass, the **detailed test cases** in Parts 6–10. Part 11 explains the database, Part 12 what to take care of, Part 13 what comes next.

---

## Part 0 — What you are testing (2 min read)

Yes Dhobi is four programs that talk to one central **API** (the "backend" — the brain that stores every customer, order, vendor, rider and payment):

| Program | Used by | Where it runs | Ready to test? |
| --- | --- | --- | --- |
| **API** (backend) | all the others | AWS, address like `http://yesdhobi-alb-….amazonaws.com` | ✅ yes |
| **Admin panel** (website) | Yes Dhobi staff | AWS CloudFront, `https://….cloudfront.net` | ✅ yes |
| **Vendor website** (registration form) | new laundry shops | AWS CloudFront, `https://….cloudfront.net` | ✅ yes |
| **Customer app** (Android/iOS) | customers | phones | ❌ **not connected to the API yet** — still shows demo data |
| **Rider/Vendor app** (Android/iOS) | riders & shops | phones | ❌ **not connected to the API yet** |

Because the two phone apps are not connected yet, we test *what the apps will do* by sending the same requests the apps will send, using a free tool called **Postman**. That proves the customer, rider and vendor sides of the API work. When the apps are connected later, they will simply reuse these already-tested requests.

**Words you will see**

* **API / endpoint** — an address the apps call, e.g. `POST /orders` = "place an order". `GET` reads, `POST` creates/does something, `PATCH` edits, `DELETE` removes.
* **Request / response** — you send a request, the API answers with a response: a status code + some JSON text.
* **Status code** — `200`/`201` = success. `400` = your input was wrong. `401` = not logged in. `403` = logged in but not allowed. `404` = not found. `409`/`422` = a business rule blocked it (e.g. "already exists", "cannot cancel after pickup"). `429` = too many attempts, wait. `500` = a bug in the API — report it.
* **Token** — after logging in, the API gives a long random string; every later request carries it to prove who you are. Postman stores it for you automatically.
* **OTP** — one-time password sent by SMS. **During testing it is always `1234`** (dev mode); real SMS comes later.

**Not working yet by design** (don't report these as bugs): real SMS, online payments (UPI/cards are a mock; cash-on-delivery and wallet work), push notifications on phones, Google login.

---

## Part 1 — Before you start: is the deployment correct? (10 min)

Do this once. Every line must pass before testing anything else; if one fails, fix it with [DEPLOY.md](DEPLOY.md) first.

1. **Collect the three addresses** from the deployment (the person who ran DEPLOY.md has them):
   * `API` — e.g. `http://yesdhobi-alb-123456.ap-south-1.elb.amazonaws.com`
   * `ADMIN` — e.g. `https://d1abc123.cloudfront.net`
   * `WEB` — e.g. `https://d2xyz456.cloudfront.net`
2. Open **`API/health`** in Chrome → you must see `{"status":"ok","service":"yesdhobi-api",…}`. ❌ If the page doesn't load: the API is down (DEPLOY.md Part 9 "Is the API running?").
3. Open **`API/api/v1/catalog/services`** → a page of text starting `{"data":[{"id":1,"code":"wash_fold"…`. ❌ If `{"data":[]}`: the seed did not run (redeploy with `SeedOnBoot=true`).
4. Open **`ADMIN`** → the login page with the Yes Dhobi logo. Log in with `admin@yesdhobi.com` and the admin password → the dashboard loads and the tiles show numbers. ❌ If a red toast says *Cannot reach the API*: DEPLOY.md Part 7 (CORS) was not done with the exact addresses.
5. In the admin panel open **Vendors** → three seeded shops (Star Bright Laundry, Sai Ram Dry Cleaners, Krishna Dhobi Shop) are listed. **Riders** → Rahul Yadav, Sunil Kumar, Zack Colah.
6. Open **`WEB`** → the website loads; click through to the partner registration form → it opens.
7. AWS console → search **CloudWatch** → **Log groups** → `/ecs/yesdhobi-api` → open the newest stream → you see lines like `GET /health -> 200`. This is where you look when something fails.

✅ All seven pass = deployment is correct. Write the three addresses on the top of your test sheet.

---

## Part 2 — What to prepare (15 min, once)

1. **Two Chrome windows**: one logged into ADMIN (leave it on **Orders**; it updates live), one for the website and for reading API pages.
2. **Postman**: download from <https://www.postman.com/downloads/> → install → open → you can skip creating an account ("Continue without an account" / lightweight API client).
3. **Import the test collection**: Postman → **File → Import** → **files** → pick `backend/postman/YesDhobi.postman_collection.json` from this repo (download the repo as ZIP from GitHub → *Code → Download ZIP* if you don't have it). A collection called **Yes Dhobi API** appears on the left with folders *0. Public, 1. Customer, 2. Vendor, 3. Rider, 4. Admin*.
4. **Point it at your API**: click the collection name → **Variables** tab → in the *Current value* column set:
   * `baseUrl` = `API` + `/api/v1` → e.g. `http://yesdhobi-alb-123456.ap-south-1.elb.amazonaws.com/api/v1`
   * `apiOrigin` = `API` (no `/api/v1`)
   * `adminPassword` = the admin password
   * `customerPhone`, `newRiderPhone`, `newVendorPhone` = three 10-digit numbers that are **not real customers'** numbers (e.g. `9811122233`). Change them each time you want a "brand-new" signup.
   * Click **Save** (Ctrl+S).
5. **Test data sheet**: a spreadsheet with columns *Test ID · Result (✅/❌) · Notes · Date*. Copy the IDs from the tables below.
6. **Seeded accounts** (exist after deployment; delete before real launch):

| Role | Login |
| --- | --- |
| Admin | `admin@yesdhobi.com` / `Admin@12345` (or the changed password) |
| Vendor — Star Bright Laundry, Bangalore | phone `9123456789`, password `Partner@123` |
| Vendor — Sai Ram Dry Cleaners / Krishna Dhobi Shop | `9123456790` / `9123456791`, `Partner@123` |
| Rider — Rahul Yadav (online, HSR Layout, Bangalore) | `9876543210`, `Partner@123` |
| Rider — Sunil Kumar / Zack Colah | `9876543211` / `9876543212`, `Partner@123` |
| Customer — Rahul Sharma | phone `9876543000`, OTP `1234` |

---

## Part 3 — How to use Postman (5 min read)

1. On the left, open a folder (e.g. **1. Customer**) and click a request (e.g. **1. Request OTP**).
2. The middle shows the request: the method (`POST`), the address (`{{baseUrl}}/auth/customer/request-otp` — `{{baseUrl}}` is replaced by your variable), and under **Body** the JSON that is sent. You rarely need to change anything.
3. Click the blue **Send** button. The bottom half shows the **response**: the status (e.g. `200 OK`) on the right and the JSON text. Read it — the test tables tell you what it should contain.
4. **Order matters**: run requests top to bottom inside a folder. Login requests save the token; "Place order" saves the order id and OTPs; later requests reuse them automatically. If a request says `401 Unauthorized`, run that folder's login request again.
5. The **Console** (bottom-left "Console" button) prints useful values — e.g. after *Place order* it prints the pickup OTP and delivery OTP.
6. To start a fresh scenario: change `customerPhone` in Variables → Save → run *1. Customer* from the top again.

Reading a response — example after *6. Place order*:

```json
{ "orderNumber": "YD-100012", "status": "PENDING_PICKUP", "statusLabel": "Pending Pickup",
  "vendor": { "name": "Star Bright Laundry" }, "pricing": { "subtotal": 200, "discount": 40, "total": 160 },
  "otps": { "pickup": "4821", "delivery": "9034" } }
```
→ order created, ₹160 to pay, assigned to Star Bright Laundry, the customer shows `4821` to the rider at pickup and `9034` at delivery.

---

## Part 4 — Where the APIs go (for whoever connects the phone apps)

Hand the app developers this:

* **Base URL:** `API/api/v1` (production) — must become `https://api.yesdhobi.com/api/v1` once the domain is set up; app stores require HTTPS.
* **Auth header** on every request after login: `Authorization: Bearer <accessToken>`; refresh with `POST /auth/refresh` when a `401` comes back.
* **Realtime:** Socket.IO on `API` with `auth: { token }` — events `order:updated`, `pickup_request:new`, `rider:location`, `notification:new`.
* **Which screen calls which endpoint:** [README.md §3.1–3.3](README.md) — one table per app screen.
* **Try it first in Postman:** every request in the collection is exactly what the app must send.

---

## Part 5 — Quick checks: "is X working?" (20 min total)

Do these before the detailed tables. Each is a yes/no answer.

### 5.1 Is the **website / vendor registration** working? (3 min)
Open `WEB` → start partner registration → fill the 5 steps with test data (use `newVendorPhone`; upload any small JPG for documents) → Submit. ✅ Success screen with a registration id **and** the shop appears in ADMIN → **Verifications** as *Pending Review*. Click **Approve** → it moves to **Vendors** as *Active*.

### 5.2 Is the **customer side** working? (5 min, Postman → 1. Customer)
Run **1 → 2b → 3 → 4 → 6** in order. ✅ 1 returns `devOtp: "1234"`; 2b returns tokens and `isNewUser: true`; 3 returns the address with `isDefault: true`; 4 shows `total: 160`; 6 returns `status: "PENDING_PICKUP"` and the order appears in the ADMIN **Orders** page **without refreshing**.

### 5.3 Is the **vendor side** working? (3 min, Postman → 2. Vendor)
Run **1 → 2 → 3 → 4**. ✅ Login succeeds; the order from 5.2 is in *new requests*; detail shows two 4-digit rider OTPs; accept returns `isAccepted: true` and the ADMIN order detail shows *Accepted by laundry partner* in its timeline.

### 5.4 Is the **rider side** working? (5 min, Postman → 3. Rider)
Run **1 → 6 (go online) → 8 → 9 → 11**. ✅ 8 lists an offer for the order (if empty, run *4. Admin → 7. Re-dispatch* then 8 again); 9 makes the order `ASSIGNED`; 11 (customer pickup OTP is filled in automatically) makes it `PICKED_UP`. ADMIN shows the rider's name on the order.

### 5.5 Is the **admin panel** working? (4 min, browser)
Orders → change that order's status dropdown to *Washing* → toast *Status Updated*. Customers → the test customer exists. Riders → Rahul Yadav is *On Delivery*. Settings → change commission to 21 → Save → reload → still 21 → set it back to 20.

✅ All five = the whole system is connected correctly. Continue with the detailed cases.

---

## Part 6 — Detailed cases: Admin panel (browser)

| ID | Test | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| A1 | Wrong password | ADMIN → `admin@yesdhobi.com` / `wrong` | Red "Invalid email or password", stays on login | |
| A2 | Login | correct password | Dashboard; top-right shows admin email | |
| A3 | Guard | logged out, open `ADMIN/orders` | Redirects to login | |
| A4 | Forgot password | login page → Forgot Password? | Green "A reset code was emailed…" | |
| A5 | Sign out | avatar → Sign out | Login page; `/` redirects to login | |
| A6 | Session refresh | stay logged in > 15 min, click a page | Still works | |
| A7 | Live KPIs | compare Dashboard tiles with Orders page | "Total Orders Today" = orders created today; "Daily Revenue" = ₹ sum of today's non-cancelled orders | |
| A8 | Pending approvals | after 5.1, reload Dashboard | new vendor in *Pending Approvals*; Verifications badge +1 | |
| A9 | Live update | Dashboard open; Postman Customer → 6 | order appears without refresh (Real-Time Sync ON) | |
| A10 | Create manual order | Orders → Create Manual Order → name/phone/address, Wash & Iron, 12 items, ₹240, Pending Pickup, Card/Paid | toast "Order Created"; row `#YD-…`; customer created in Customers | |
| A11 | Edit order | edit → amount 300, rider "Rahul Yadav" | row shows ₹300 and Rahul Yadav | |
| A12 | Status dropdown | set "Washing" | toast; badge changes; Postman Vendor → 3 shows `WASHING` | |
| A13 | New labels | set "Picked Up", then "Quality Check" | both accepted | |
| A14 | Search | type phone or `#YD-100` | list filters | |
| A15 | Delete order | delete a Pending Pickup order | status Cancelled (kept in list) | |
| A16 | Export CSV | Export CSV | file downloads | |
| A17 | Add customer | Customers → Add, phone `9000000001` | row, wallet ₹0, Active | |
| A18 | Duplicate phone | add `9000000001` again | error toast "already exists" | |
| A19 | Edit customer | status VIP | badge VIP | |
| A20 | Add vendor | Vendors → Add, phone `9000000002`, location "…, Bangalore", zone "HSR Layout" | row Active | |
| A21 | Suspend vendor | toggle status | Suspended; Postman Vendor → 1 with that phone → 403; toggle back | |
| A22 | Add rider | Riders → Add, phone `9000000003`, Scooter | row Offline, approved | |
| A23 | Toggle rider | toggle | Online ↔ Offline | |
| A24 | Delete busy rider | delete Rahul while he has an active job | error "has active delivery(ies)" | |
| A25 | Add service | Services → Add "Curtain Cleaning" ₹99 /item 48h | in `API/api/v1/catalog/services` | |
| A26 | Toggle service | Inactive | gone from public catalog | |
| A27 | Add surcharge | rule "Rainy day", trigger "Always", modifier "Flat ₹20" | modifier "Flat ₹20 Surcharge"; Customer → 4 quote +₹20 | |
| A28 | Delete surcharge | delete it | quote back to normal | |
| A29 | Add promotion | code TEST10, Percentage 10, min 100, Unlimited, 30 Days | Active; in `catalog/promotions` | |
| A30 | Toggle promotion | off | Customer → 5 with TEST10 → "Invalid coupon code" | |
| A31–A34 | Verifications | view docs / Approve / Reject with reason | docs open (S3); approved vendor can log in; rejected shows reason | |
| A35 | Ticket appears | Postman Customer → 12 | row in Support; badge +1 live | |
| A36 | Reply | reply "We are checking" | staff message; status In Progress; Customer → 13 shows it | |
| A37 | Resolve | status Resolved | badge Resolved | |
| A38 | Process payout | after Part 9 golden path, Revenue → Process | Processed; Vendor → 8 `outstanding: 0` | |
| A40 | Settings | commission 25 → Save → reload | still 25; set back to 20 | |
| A41 | Zones | add "Whitefield, Bangalore" → Pause → Delete | each persists after reload | |
| A42 | Broadcast | Riders, "Heavy rain" | toast "sent to N riders"; Rider → 17 lists it | |
| A43 | Notifications bell | click | order/KYC/ticket notifications; mark read | |
| A44 | Maintenance | Settings → Maintenance ON → Save; Customer → 6 | 503 "under maintenance"; admin still works; turn OFF | |

## Part 7 — Detailed cases: Customer (Postman → 1. Customer)

| ID | Request | Expected | Result |
| --- | --- | --- | --- |
| C1 | 1 (new number) | 200, `isNewUser: true`, `devOtp: "1234"` | |
| C2 | 2 (no name, new user) | 400 "Name is required" | |
| C3 | 2b | 200, tokens, `isNewUser: true` | |
| C4 | 2b with otp `0000` | 400 "Incorrect OTP" | |
| C5 | 3 | 201, `isDefault: true` | |
| C6 | 4 | `subtotal 200, discount 40, deliveryFee 0, total 160` | |
| C7 | 5 (FLAT100) | 422 "Minimum order of ₹499 required" | |
| C8 | 6 | 201 `PENDING_PICKUP`, vendor = nearest active, 4-digit OTPs | |
| C9 | 7 (wallet, big order) | 422 "Insufficient wallet balance" | |
| C10 | 8 / 9 / 10 | order listed; `tracking[]` current step "Pickup Scheduled" | |
| C11 | 11 (pending order) | `CANCELLED`; again → 422. *Skip if continuing to the golden path.* | |
| C12 | 12 | 201 `TKT-…` | |
| C13 | 13 | admin reply visible after A36 | |
| C14 | 14 / 15 | invoice lines + totals; reorder items + quote | |
| C15 | 16 / 16b | balance +100; transaction listed | |
| C16 | 17 | status notifications | |
| C17 | 1 with `9876543000` | `isNewUser: false` | |
| C18 | 20 | new tokens | |

## Part 8 — Detailed cases: Rider and Vendor (Postman → 3. Rider / 2. Vendor)

| ID | Request | Expected | Result |
| --- | --- | --- | --- |
| R1 | Rider 1 | 200; `onboardingStatus: APPROVED` | |
| R2 | Rider 1 wrong password | 401 | |
| R3 | Rider 2 → 3 → 4 → 4b | 201 → `VEHICLE_DETAILS` → `UNDER_REVIEW`; in admin Verifications; Rider 6 with `newRiderToken` → 403 until approved | |
| R4 | Rider 5 | `verified: true`; `selfieUrl` opens in browser | |
| R5 | Rider 6 / 6b | availability toggles; admin Riders shows it | |
| R6 | Rider 7 | 200; coordinates update in admin | |
| R7 | Rider 8 (≤ 45 s after an order) | offer with `remainingSeconds`, `payout` | |
| R8 | Rider 9 | `ASSIGNED`; other riders' offers expire | |
| R9 | Rider 10 | 200; "Load weighed" event | |
| R10 | Rider 11 with wrong OTP (edit body to `0000`) | 400 | |
| R11 | Rider 11 | `PICKED_UP` | |
| R12 | Vendor 3 then Rider 12 | `IN_LAUNDRY`; Rider 15 today > 0 | |
| R13 | Vendor 6/6b/6c → Vendor 7 | `READY`, `ridersNotified ≥ 1` | |
| R14 | Rider 8 → 9 (DELIVERY offer) → Vendor 3 → Rider 13 → Rider 14 | `OUT_FOR_DELIVERY` → `DELIVERED`, `paymentStatus: PAID` | |
| R15 | Rider 15 / 16 | earnings summary; payout 201 Pending (min ₹100) | |
| V1 | Vendor 1 | 200 `status: ACTIVE` | |
| V2 | Vendor 2 | new order listed, `isAccepted: false` | |
| V3 | Vendor 3 | `otps.riderDrop`, `otps.riderHandover` | |
| V4 | Vendor 4; then 5 | accepted; reject → 422 | |
| V5 | Vendor 8 (after R14) | today's amount = subtotal × 80% | |
| V6 | Vendor 9 | 201 Pending → admin A38 | |
| V7 | Vendor 10 / 10b | services listed; price updated | |
| V8 | Vendor 11 / 12 | counts match; profile | |

## Part 9 — Golden path (one full order, all roles, ~15 min)

Keep ADMIN → Orders visible; every step updates live.

1. Customer: 1 → 2b → 3 → 6 (note the console line with both OTPs).
2. Vendor: 1 → 2 → 4 (accept).
3. Rider: 1 → 6 (online) → 8 → 9 (accept) → 11 (pickup) → Vendor 3 (fills drop OTP) → Rider 12 (drop-off).
4. Vendor: 6 → 6b → 6c → 7 (book rider).
5. Rider: 8 → 9 (delivery offer) → Vendor 3 (handover OTP) → Rider 13 → Rider 14.
6. Customer: 10 (all steps done) → 18 (rate 5★).
7. Vendor: 8 (earnings ₹128 = ₹160 × 80%) → 9 (payout). Admin: Revenue → Process. Vendor: 8 → `outstanding: 0`.
8. Admin order detail: Delivered, Paid, rider + vendor names, rating 5.

## Part 10 — Security & edge cases

| ID | Test | Expected | Result |
| --- | --- | --- | --- |
| X1 | Customer token on Admin → 3 (swap the auth to `customerToken`) | 403 | |
| X2 | Remove auth on Customer → 8 | 401 | |
| X3 | Rider B (login `9876543211`) runs Rider 11 on rider A's order | 403 | |
| X4 | Customer 1 four times in 10 min | 4th → 429 | |
| X5 | 25 wrong admin logins | 429 | |
| X6 | Website: submit with an existing phone | error "already exists" shown | |
| X7 | Website: 10 MB image | rejected; 6 MB accepted | |
| X8 | Any action on a cancelled order | 409/422, never 500 | |

**Bug report template** (paste into WhatsApp/email to the developer):
```
Test ID:      R11
Where:        Postman / Admin panel / Website
Steps:        1. … 2. …
Expected:     …
Actual:       … (paste status code + response text or the toast)
Time (IST):   2026-09-21 14:32
Order/user:   YD-100012 / 98xxxxxxx
```

---

## Part 11 — The database: what it is, how to see it

* **Where:** Amazon RDS PostgreSQL in Mumbai, name `yesdhobi-db`. It is **private** — nothing on the internet can connect to it directly, only the API. That is deliberate.
* **Normal way to look at data: the admin panel.** Customers, Vendors, Riders, Orders, Payouts, Tickets, Settings — everything a person needs is there. You never need to open the database for testing.
* **Backups:** automatic every day, kept 7 days. AWS console → **RDS** → **Snapshots**. To restore: select a snapshot → **Restore** (makes a copy; ask the developer before doing this).
* **Password:** stored in AWS **Secrets Manager** as `yesdhobi/db`; the API reads it automatically. Nobody needs to type it.
* **Developers who need raw SQL** open a shell *inside* the API container (it already has the connection): AWS console → ECS → `yesdhobi-cluster` → `yesdhobi-api` → Tasks → task id → **Connect** (Execute command, `sh`), then e.g. `node -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT count(*) FROM \"Order\"\`.then(console.log)"`. Or run the project locally (`README.md` §1) and use `npm run prisma:studio` for a visual table browser on a local copy.
* **Data model:** 36 tables; the important ones are `User` (all logins, with a role), `Customer`/`Rider`/`Vendor` (profiles), `Order` + `OrderItem` + `OrderEvent` (the order and its timeline), `PickupRequest` (offers to riders), `LedgerEntry`/`Payout` (money owed and paid), `Verification` (KYC), `SupportTicket`. Full definition: `prisma/schema.prisma`.

---

## Part 12 — Things to take care of

* **Test only with fake phone numbers.** In dev mode no SMS is sent; once `SmsProvider=sns` is on, every OTP request costs money and reaches a real phone.
* **The OTP is 1234 for everyone while `OtpDevMode=true`. Do not share the app or website with the public until it is turned off** (DEPLOY.md Part 11.1).
* **Change the admin password** on first login and keep the `deployer` access-key CSV private (whoever has it controls the AWS account).
* **Clean up before launch:** delete the seeded shops/riders/customers and all test orders from the admin panel, or redeploy with `SeedOnBoot=false` on a fresh database.
* **Costs:** ≈ ₹3,000/month while testing. AWS console → **Billing** → *Bills* shows the running total. Deleting the two CloudFormation stacks stops all charges.
* **Who can do what:** the admin panel is for staff only — do not give its address to vendors or riders (they get the app).
* **Where to look when something is wrong:** CloudWatch logs (Part 1 step 7) first; then the bug template above.
* **Redeploying after a fix:** DEPLOY.md Part 9 — one command each for the API and the websites. Re-run Part 5 quick checks after every redeploy.
* **Automated tests** run by the developer before every release: `cd backend && npm test` (28 tests) — ask for the "28 passed" line.

---

## Part 13 — Next steps after testing passes

1. **Connect the two phone apps to the API** (biggest remaining piece, 1–2 weeks of app development): add an HTTP client + token storage, follow README §3.1–3.3 screen by screen. Rider/Vendor app first (partners onboard), Customer app second. Every request already exists in the Postman collection.
2. **Real SMS OTPs:** DLT registration with the telecom operator → SNS production access → redeploy with `SmsProvider=sns OtpDevMode=false` (DEPLOY.md 11.1).
3. **Online payments:** Razorpay / PhonePe for Business merchant account → developer wires the keys into `src/modules/payments/payments.routes.ts`.
4. **Push notifications:** Firebase project → FCM sending from `src/services/notifications.ts`.
5. **Domain + HTTPS:** `api.yesdhobi.com`, `admin.yesdhobi.com`, `yesdhobi.com` (DEPLOY.md 11.3). Required before app-store release.
6. **Email:** SES verified domain → `MailProvider=ses`.
7. **Launch clean-up:** Part 12 bullets; restrict `CorsOrigins` to the real domains; `SeedOnBoot=false`.
8. **Monitoring:** CloudWatch alarms on API errors and on "running tasks < 1"; RDS storage alarm.
9. **App store release** of the two apps once connected and tested on real devices.
