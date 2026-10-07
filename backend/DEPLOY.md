# Yes Dhobi — Step-by-step AWS deployment guide

This guide assumes you have **never used AWS or a terminal before**. Follow it top to bottom, in order, on a Windows laptop. Total time: about **1 hour** (most of it is waiting).

At the end you will have:

* the **API** running at an AWS address (e.g. `http://yesdhobi-alb-1234.ap-southeast-2.elb.amazonaws.com`)
* the **Admin panel** at an `https://….cloudfront.net` address
* the **Website** (vendor registration) at another `https://….cloudfront.net` address

Everything is created inside the Yes Dhobi AWS account (**437045580471**, VASTRA SOLUTIONS PRIVATE LIMITED). The deployment currently runs in **Sydney (ap-southeast-2)**, the account's home region — that is what the scripts default to. To host in India instead, prefix every deploy command with `AWS_REGION=ap-south-1` (lower latency for Indian users, and data stays in India); do this before the first deploy, because moving an existing stack means recreating it.

> **Cost:** about ₹3,000/month (≈ $35) in the first year, ≈ ₹4,000/month after (the database is free for 12 months). Nothing here is a one-time purchase; you can delete everything at any time (see Part 9).

---

## Part 1 — Install three programs on your laptop (10 min)

Do these once. If a program is already installed, skip it.

### 1.1 Git for Windows (gives you "Git Bash", the black window where you type commands)

1. Open <https://git-scm.com/download/win> → click **"Click here to download"**.
2. Run the downloaded file. Click **Next** on every screen (defaults are fine) → **Install** → **Finish**.

### 1.2 Node.js (needed to build the admin panel and website)

1. Open <https://nodejs.org> → click the big **LTS** download button.
2. Run the file → **Next** on every screen → **Install** → **Finish**.

### 1.3 AWS CLI (lets your laptop talk to AWS)

1. Open <https://awscli.amazonaws.com/AWSCLIV2.msi> — it downloads immediately.
2. Run the file → **Next** → accept the licence → **Next** → **Next** → **Install** → **Finish**.

### 1.4 Check they work

1. Press the **Windows key**, type `Git Bash`, press **Enter**. A black window opens. **This window is where you type every command in this guide.**
2. Copy each line below, paste it into the window (right-click → Paste, or Shift+Insert), press Enter, and check you get a version number back (not "command not found"):

```bash
git --version
```
```bash
node --version
```
```bash
aws --version
```

If one says *command not found*: close Git Bash, open it again, try again. If it still fails, reinstall that program.

---

## Part 2 — Get the code onto your laptop (3 min)

In Git Bash, paste these one at a time (each finishes in a few seconds):

```bash
mkdir -p ~/yesdhobi && cd ~/yesdhobi
```
```bash
git clone https://github.com/jagadeesh3344/yes-dhobi.git
```
```bash
git clone https://github.com/jagadeesh3344/Yes-dhobi-admin-panel.git
```

You now have a folder `C:\Users\<you>\yesdhobi` containing `yes-dhobi` (website + `backend/`) and `Yes-dhobi-admin-panel`. Keep them side by side exactly like this — the deploy script expects it.

---

## Part 3 — Create a "deployer" key in AWS (5 min)

AWS will only accept commands from your laptop if it has a key. You create the key in the AWS website.

1. Go to <https://console.aws.amazon.com> and sign in with **admin@yesdhobi.com** and its password.
2. **Check the region** (top-right corner of the page, next to your name). It must match the region the backend is deployed in — **Asia Pacific (Sydney) ap-southeast-2** unless you chose Mumbai.
3. In the **search bar at the very top**, type `IAM` and click **IAM** (it says "Manage access to AWS resources").
4. In the **left menu** click **Users**.
5. Click the orange **Create user** button (top right).
6. **User name:** type `deployer`. Leave *"Provide user access to the AWS Management Console"* **unticked**. Click **Next**.
7. Under *Permissions options* choose **Attach policies directly**.
8. In the search box under it type `AdministratorAccess`. Tick the box next to **AdministratorAccess** (exactly that name). Click **Next**.
9. Click **Create user**.
10. Click the user name **deployer** in the list.
11. Click the **Security credentials** tab (middle of the page).
12. Scroll to **Access keys** → click **Create access key**.
13. Choose **Command Line Interface (CLI)** → tick *"I understand the above recommendation…"* at the bottom → **Next** → **Create access key**.
14. You now see **Access key** and **Secret access key**. Click **Download .csv file** and keep it somewhere safe. **This page is the only time the secret is shown.** Keep the page open for the next part.

> Never paste these keys into chat, email or WhatsApp. Anyone with them controls the AWS account.

---

## Part 4 — Connect your laptop to AWS (2 min)

1. Back in **Git Bash**, paste:

```bash
aws configure --profile yesdhobi
```

2. It asks four questions. Answer them like this, pressing Enter after each:

| Question | What to type |
| --- | --- |
| `AWS Access Key ID` | copy the **Access key** from the AWS page (starts with `AKIA`) |
| `AWS Secret Access Key` | copy the **Secret access key** |
| `Default region name` | `ap-southeast-2` (or `ap-south-1` if you chose Mumbai) |
| `Default output format` | `json` |

3. Check it worked:

```bash
aws sts get-caller-identity --profile yesdhobi
```

You must see `"Account": "437045580471"` in the answer. If you see an error, run `aws configure --profile yesdhobi` again and re-paste the keys carefully (no spaces).

---

## Part 5 — Deploy the backend (15–20 min, mostly waiting)

1. In Git Bash paste:

```bash
cd ~/yesdhobi/yes-dhobi/backend && AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

2. Leave the window open. You will see:
   * `==> Deploying yesdhobi-backend to account 437045580471 in ap-southeast-2`
   * `==> Phase 1/3: creating infrastructure …` — **this step takes 10–15 minutes** (the database is being created). It's normal for nothing to print for several minutes.
   * `==> Phase 2/3: building the API image …` then dots `....` for 3–5 minutes, then `build succeeded`.
   * `==> Phase 3/3: applying parameters and starting the service` and `waiting for the service to become stable` (2–3 minutes).
   * Finally: `==> API is up: http://yesdhobi-alb-….ap-southeast-2.elb.amazonaws.com/health` followed by `{"status":"ok",…}`.

3. **Copy that API address** (everything before `/health`) into a notepad — you need it later. Example: `http://yesdhobi-alb-123456789.ap-southeast-2.elb.amazonaws.com`

4. Test it in your browser: open `<API address>/health` — you should see `{"status":"ok"…}`.

If the script stops with an error, go to **Part 10 — Troubleshooting**.

---

## Part 6 — Deploy the admin panel and website (5–10 min)

```bash
cd ~/yesdhobi/yes-dhobi/backend && AWS_PROFILE=yesdhobi bash infra/deploy-frontends.sh
```

You will see it build the admin panel, then the website (a lot of text scrolls by — normal), then at the end:

```
==> Admin panel: https://d1abc…cloudfront.net
==> Website    : https://d2xyz…cloudfront.net
```

**Copy both addresses** into your notepad. The pages may take **5 more minutes** to start working world-wide (CloudFront is spreading the files to its servers). If you get an error page, wait and refresh.

---

## Part 7 — Tell the API which websites may talk to it (2 min)

For security the API only accepts browser requests from addresses you allow. Replace the two addresses in the command below with **your** admin and website addresses from Part 6 (comma between them, **no spaces**), then run it:

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="CorsOrigins=https://d1abc.cloudfront.net,https://d2xyz.cloudfront.net" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

It keeps everything that already exists, rebuilds the API image and restarts it — about 8 minutes. (Settings you passed before are remembered; you only need to pass what changes.)

---

## Part 8 — Check everything works (5 min)

1. Open the **Admin panel** address → sign in with **admin@yesdhobi.com** / **Admin@12345**.
2. **Immediately change the password:** Settings → Admins → edit → new password.
3. Open the **Website** address → fill in the vendor registration form with test data and submit → you should see a success screen with a registration id.
4. Back in the admin panel → **Verifications** → the test vendor is listed → click **Approve**.
5. Mobile apps: the API address from Part 5 (plus `/api/v1`) is what the Flutter developers put in the apps.

Test logins that exist after the first deploy (delete them from the admin panel before real launch):

| Who | Login |
| --- | --- |
| Vendor "Star Bright Laundry" | phone `9123456789`, password `Partner@123` |
| Rider "Rahul Yadav" | phone `9876543210`, password `Partner@123` |
| Any customer | any phone number, OTP is `1234` (see Part 11 to switch to real SMS) |

---

## Part 9 — Everyday operations

### Deploy a code change
After developers push new code to GitHub `main`:

```bash
cd ~/yesdhobi/yes-dhobi && git pull && cd backend && AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```
(and `bash infra/deploy-frontends.sh` if the admin panel or website changed; run `git pull` inside `Yes-dhobi-admin-panel` first).

### See the API logs
AWS console → search **CloudWatch** → left menu **Log groups** → `/ecs/yesdhobi-api` → click the latest stream.

### Is the API running?
AWS console → search **ECS** → **Clusters** → `yesdhobi-cluster` → **Services** → `yesdhobi-api` → *Running tasks* should be 1.

### Delete everything (stops all charges)
AWS console → search **CloudFormation** → select `yesdhobi-frontends` → **Delete** → wait → select `yesdhobi-backend` → **Delete**. (The database leaves one final backup snapshot; delete it under RDS → Snapshots if you don't want it.)

---

## Part 10 — Troubleshooting

| What you see | What it means | What to do |
| --- | --- | --- |
| `Unable to locate credentials` | the laptop key is missing | run Part 4 again |
| `An error occurred (AccessDenied)` / `not authorized` | the `deployer` user lacks permission | Part 3 step 8: make sure **AdministratorAccess** is attached |
| `"Account": "…"` shows a different number | you configured a different AWS account | Part 3 must be done while signed in as admin@yesdhobi.com |
| `Stack … is in ROLLBACK_COMPLETE state` | the first creation failed half-way | console → **CloudFormation** → select `yesdhobi-backend` → **Delete**; wait until it disappears; run Part 5 again |
| `build FAILED` in Phase 2 | the Docker image failed to build | console → **CodeBuild** → **Build projects** → `yesdhobi-api-build` → latest build → **Build logs**; send the red lines to the developer |
| `waiting for the service to become stable` never finishes (> 15 min) | the API crashes on start | CloudWatch logs (Part 9) — usually a wrong parameter; send the log lines to the developer |
| Admin panel shows *"Cannot reach the API"* | Part 7 not done or wrong addresses | run Part 7 again with the exact `https://…cloudfront.net` addresses |
| CloudFront page shows *403* right after deploy | files still spreading | wait 5 minutes, refresh |
| `npm: command not found` | Node.js not installed / Git Bash opened before install | Part 1.2, then close and reopen Git Bash |
| `Permission denied (publickey)` on `git clone` | wrong clone URL | use the exact `https://…` commands from Part 2 |

---

## Part 11 — Before launching to real customers

Do these after the test above works. Each is one AWS setting plus one redeploy.

### 11.1 Real SMS for OTPs (right now the OTP is always 1234)

**How the OTP works today:** when someone taps "Send OTP", the API generates a 4-digit code, stores only its hash (never the code itself), sets a 5-minute expiry, and hands the message to the configured SMS provider. Verification checks the hash, allows 5 wrong attempts, then burns the code. Requesting more than 3 codes in 10 minutes for the same number is blocked. While `OtpDevMode=true` the code is always `1234` and is also returned in the API response so you can test without SMS.

To send real SMS you need (a) permission from the Indian telecom regulator (DLT) and (b) an SMS provider account. Pick one provider:

**Option A — AWS SNS** (stays inside the AWS account you already have)
1. Register on your operator's **DLT portal** (Jio/Airtel/Vi): create an *Entity* (get the **Entity ID**), register a **Sender ID** (6 letters, e.g. `YESDHB`) and an **OTP template** whose text matches ours: `{#var#} is your Yes Dhobi verification code. Valid for {#var#} minutes.` → you get a **Template ID**.
2. AWS console → **SNS** (same region as the backend) → **Text messaging (SMS)** → *Request production access* (exit the sandbox), then register your Sender ID / DLT details under **Sender IDs**.
3. Redeploy with the values from step 1:
```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="SmsProvider=sns OtpDevMode=false SeedOnBoot=false SmsSenderId=YESDHB SmsDltEntityId=<entity id> SmsOtpTemplateId=<template id>" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

**Option B — MSG91** (Indian provider; DLT paperwork is handled inside their panel and is usually quicker)
1. Sign up at msg91.com → complete DLT/sender-id registration → create a **Flow/Template** for the OTP message → note the **Auth Key** and **Template ID**.
2. Redeploy:
```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="SmsProvider=msg91 OtpDevMode=false SeedOnBoot=false SmsSenderId=YESDHB Msg91AuthKey=<auth key> Msg91OtpTemplateId=<template id>" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

**Option C — WhatsApp instead of SMS (no DLT needed)**
WhatsApp OTP is **not** covered by TRAI's DLT rules — it runs on Meta's platform, so there is no operator registration. You still need a Meta Business account with the business verified, a WhatsApp Business number, a permanent access token and a template of category **AUTHENTICATION** approved by Meta (usually same-day). Then:

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="OtpChannel=whatsapp_then_sms OtpDevMode=false SeedOnBoot=false WhatsappPhoneNumberId=<phone number id> WhatsappAccessToken=<permanent token> WhatsappOtpTemplate=<template name>" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

`OtpChannel` values: `sms`, `whatsapp`, or `whatsapp_then_sms` (try WhatsApp first and fall back to SMS if the customer is not on WhatsApp — recommended). Cost is about ₹0.115 + GST per WhatsApp authentication message, similar to SMS.

**Option D — Twilio** (only practical for non-Indian numbers / internal testing): `SmsProvider=twilio TwilioAccountSid=… TwilioAuthToken=… TwilioFrom=+1…`.

**Check it worked:** request an OTP for your own number from the app or with
`curl -X POST <API>/api/v1/auth/customer/request-otp -H "Content-Type: application/json" -d '{"phone":"<your number>"}'`.
The response must **not** contain `devOtp` any more, and the SMS should arrive within seconds. If it doesn't, CloudWatch logs (`/ecs/yesdhobi-api`) show the provider's exact error — the usual causes are "sender id not registered", "template mismatch" (the text must match the approved template word for word) or "account still in sandbox".

### 11.2 Email (password resets, notifications)
1. AWS console → search **SES** → **Identities** → **Create identity** → *Domain* `yesdhobi.com` → follow the DNS instructions it shows (add the records at your domain registrar) → wait until it says *Verified*.
2. SES → **Get set up** → **Request production access**.
3. Add `MailProvider=ses MailFrom="Yes Dhobi <no-reply@yesdhobi.com>"` to the `PARAMS` in the command above and redeploy.

### 11.3 Domains and HTTPS — what is already done, what is left

Current state (checked on the live site):

| Address | Status |
| --- | --- |
| `https://yesdhobi.com` | ✅ working. Hosted on **Vercel**, which issues and auto-renews a free Let's Encrypt certificate. Nothing to buy, nothing expires. |
| `https://www.yesdhobi.com` | ❌ **broken** — the certificate covers only `yesdhobi.com`, so visitors typing `www.` get a browser security warning. Fix: Vercel → project → **Settings → Domains → Add** `www.yesdhobi.com` (Vercel issues the certificate and redirects it to the bare domain automatically). 2 minutes. |
| `https://admin.yesdhobi.com` | ❌ does not exist yet. The admin panel needs a home — add it as a Vercel project and attach this subdomain (free certificate again). |
| `https://api.yesdhobi.com` | ❌ does not exist yet. See below — this one is needed before the mobile apps ship. |

**About the SSL your domain provider sold you:** you do not need it. Vercel already issues a free certificate for every domain attached to it. A registrar certificate also cannot be used on an AWS load balancer or CloudFront unless you import it into AWS Certificate Manager — and ACM issues equivalent certificates for free, with automatic renewal. So: keep using Vercel's, and use ACM for AWS. No purchase required.

**Why `api.yesdhobi.com` is still needed.** Today the website reaches the API through a Vercel rewrite (`/api/v1/*` → the AWS load balancer), which works for ordinary requests. But:
* it does **not** pass WebSocket traffic, so live order tracking and the admin panel's real-time updates will not work through it (verified: `/socket.io/` through the website returns the web page, not the API);
* the mobile apps cannot use it — Google Play and the App Store require the app to call an **HTTPS** endpoint, and the load balancer currently serves plain HTTP.

Setting it up (free, ~30 minutes, mostly DNS waiting):
1. AWS console → **Certificate Manager**, in the **same region as the backend** (ap-southeast-2 unless you moved to Mumbai) → **Request** → public certificate → domain `api.yesdhobi.com` → DNS validation → add the CNAME record it shows at your domain provider → wait for **Issued** → copy the certificate **ARN**.
2. Redeploy the API with the certificate so it serves HTTPS:

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="CertificateArn=<certificate ARN> PublicBaseUrl=https://api.yesdhobi.com CorsOrigins=https://yesdhobi.com,https://www.yesdhobi.com,https://admin.yesdhobi.com" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

3. At your domain provider add a **CNAME**: `api` → the load balancer address (the `yesdhobi-alb-….elb.amazonaws.com` part, without `http://`).
4. Check `https://api.yesdhobi.com/health` returns `{"status":"ok"}`, then point the admin panel and the mobile apps at `https://api.yesdhobi.com/api/v1`.

### 11.4 Payments — Razorpay

The gateway is fully coded; it only needs your Razorpay account and keys. Until then the API runs a built-in **mock** gateway (cash on delivery and wallet work for real).

1. **Create the account:** sign up at <https://dashboard.razorpay.com>. Complete KYC (PAN, GST if you have one, bank account, business proof). Activation usually takes 1–2 working days.
2. **Get the keys:** Dashboard → **Account & Settings → API Keys → Generate Key**. You get a **Key ID** (`rzp_live_…`) and a **Key Secret** — the secret is shown once, save it. Use the **Test Mode** keys (`rzp_test_…`) first.
3. **Create the webhook:** Dashboard → **Account & Settings → Webhooks → Add New Webhook**.
   * URL: `<API address>/api/v1/payments/webhook` (e.g. `http://yesdhobi-alb-….elb.amazonaws.com/api/v1/payments/webhook`)
   * Secret: type any strong random string and keep a copy — this is the **Webhook Secret**.
   * Active events: tick **payment.captured** and **payment.failed**.
4. **Switch the API to Razorpay:**

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="PaymentProvider=razorpay RazorpayKeyId=<key id> RazorpayKeySecret=<key secret> RazorpayWebhookSecret=<webhook secret>" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

5. **Test with the test keys** before going live: place an order in the app, choose UPI/card, and pay with Razorpay's test details (dashboard → Test Mode → test cards; e.g. card `4111 1111 1111 1111`, any future expiry, CVV `123`). The order's payment status must flip to **Paid** in the admin panel, and the webhook must show a green tick in the Razorpay dashboard.
6. **Go live:** repeat step 4 with the `rzp_live_…` keys and a webhook created in Live Mode.

What the backend does for you: creates the Razorpay order, verifies the checkout signature, double-checks the payment with Razorpay's API before marking it paid, listens to the webhook (so a payment still settles if the customer's app crashes mid-payment), and **automatically refunds** a captured payment if the order is later cancelled.

Fees: UPI has 0% MDR by RBI rule but Razorpay charges a ~2% platform fee; cards/netbanking/wallets are 2% + 18% GST. New merchants currently get 0% platform fee for 90 days or ₹5 lakh, whichever comes first.

### 11.5 Address search and the map (Amazon Location Service)

The customer app's "pick your exact location" screen - search an address, then
drag the pin, the way Uber and Rapido do it - is built and waiting for one API
key. Until you create it the search box stays hidden and customers type their
address by hand exactly as before, so nothing breaks in the meantime.

1. AWS console -> search **Location Service** -> **API keys** -> **Create API key**.
2. Name it `yesdhobi-places`. Under **Resources / actions**, allow these three:
   * `geo-places:Autocomplete`
   * `geo-places:GetPlace`
   * `geo-places:ReverseGeocode`
3. Leave the expiry blank (or set a far-future date), create it, and **copy the key value**.
4. Hand it to the backend:

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="AwsLocationApiKey=<the key>" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```

5. Check it worked:

```bash
curl "<API address>/api/v1/geo/config"
curl "<API address>/api/v1/geo/autocomplete?q=hsr%20layout"
```

The first must say `{"searchEnabled":true}`; the second must return a list of
Bangalore addresses.

**Create the key in the same region as the backend** (ap-southeast-2 unless you
have moved to Mumbai). The backend calls `places.geo.<its own region>.amazonaws.com`,
so a key issued in a different region comes back 403 and the endpoint reports
"address search is misconfigured".

**Cost.** Around US$4.75 per 1,000 autocomplete sessions and the same per 1,000
stored geocodes; Places v2 has no free tier. One customer saving one address is
a few autocomplete calls plus one stored lookup, so roughly half a US cent per
address. Map tiles drawn by the app are billed separately, about US$0.04 per
1,000 tiles.

---

---

## Quick reference — the whole thing in 6 commands

```bash
aws configure --profile yesdhobi                                   # once (Part 4)
cd ~/yesdhobi/yes-dhobi/backend
AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh                  # API
AWS_PROFILE=yesdhobi bash infra/deploy-frontends.sh                # admin panel + website
PARAMS="CorsOrigins=https://ADMIN,https://WEB" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh   # allow the sites
```
