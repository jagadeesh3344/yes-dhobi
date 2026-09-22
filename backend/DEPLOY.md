# Yes Dhobi — Step-by-step AWS deployment guide

This guide assumes you have **never used AWS or a terminal before**. Follow it top to bottom, in order, on a Windows laptop. Total time: about **1 hour** (most of it is waiting).

At the end you will have:

* the **API** running at an AWS address (e.g. `http://yesdhobi-alb-1234.ap-south-1.elb.amazonaws.com`)
* the **Admin panel** at an `https://….cloudfront.net` address
* the **Website** (vendor registration) at another `https://….cloudfront.net` address

Everything is created inside the Yes Dhobi AWS account (**437045580471**, VASTRA SOLUTIONS PRIVATE LIMITED) in the **Mumbai (ap-south-1)** region.

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
2. **Check the region** (top-right corner of the page, next to your name). If it does not say **Asia Pacific (Mumbai) ap-south-1**, click it and choose **Asia Pacific (Mumbai)**.
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
| `Default region name` | `ap-south-1` |
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
   * `==> Deploying yesdhobi-backend to account 437045580471 in ap-south-1`
   * `==> Phase 1/3: creating infrastructure …` — **this step takes 10–15 minutes** (the database is being created). It's normal for nothing to print for several minutes.
   * `==> Phase 2/3: building the API image …` then dots `....` for 3–5 minutes, then `build succeeded`.
   * `==> Phase 3/3: applying parameters and starting the service` and `waiting for the service to become stable` (2–3 minutes).
   * Finally: `==> API is up: http://yesdhobi-alb-….ap-south-1.elb.amazonaws.com/health` followed by `{"status":"ok",…}`.

3. **Copy that API address** (everything before `/health`) into a notepad — you need it later. Example: `http://yesdhobi-alb-123456789.ap-south-1.elb.amazonaws.com`

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
2. AWS console → **SNS** → **Text messaging (SMS)** → *Request production access* (exit the sandbox), then register your Sender ID / DLT details under **Sender IDs**.
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

**Option C — Twilio** (only practical for non-Indian numbers / internal testing): `SmsProvider=twilio TwilioAccountSid=… TwilioAuthToken=… TwilioFrom=+1…`.

**Check it worked:** request an OTP for your own number from the app or with
`curl -X POST <API>/api/v1/auth/customer/request-otp -H "Content-Type: application/json" -d '{"phone":"<your number>"}'`.
The response must **not** contain `devOtp` any more, and the SMS should arrive within seconds. If it doesn't, CloudWatch logs (`/ecs/yesdhobi-api`) show the provider's exact error — the usual causes are "sender id not registered", "template mismatch" (the text must match the approved template word for word) or "account still in sandbox".

### 11.2 Email (password resets, notifications)
1. AWS console → search **SES** → **Identities** → **Create identity** → *Domain* `yesdhobi.com` → follow the DNS instructions it shows (add the records at your domain registrar) → wait until it says *Verified*.
2. SES → **Get set up** → **Request production access**.
3. Add `MailProvider=ses MailFrom="Yes Dhobi <no-reply@yesdhobi.com>"` to the `PARAMS` in the command above and redeploy.

### 11.3 Your own domain names (https://api.yesdhobi.com, admin.yesdhobi.com, yesdhobi.com)
1. AWS console → **Certificate Manager** (region **Mumbai**) → **Request** → public certificate → domain `api.yesdhobi.com` → DNS validation → add the CNAME it shows at your registrar → wait for *Issued* → copy its **ARN** (`arn:aws:acm:ap-south-1:…`).
2. Change region (top-right) to **US East (N. Virginia)** → Certificate Manager → request one certificate covering `yesdhobi.com`, `www.yesdhobi.com`, `admin.yesdhobi.com` → validate the same way → copy its ARN. (CloudFront only accepts certificates from this region.)
3. Redeploy:

```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="CertificateArn=<mumbai cert ARN> PublicBaseUrl=https://api.yesdhobi.com CorsOrigins=https://admin.yesdhobi.com,https://yesdhobi.com" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh
```
```bash
cd ~/yesdhobi/yes-dhobi/backend && PARAMS="AdminDomainName=admin.yesdhobi.com WebDomainName=yesdhobi.com CertificateArn=<virginia cert ARN>" AWS_PROFILE=yesdhobi bash infra/deploy-frontends.sh
```

4. At your domain registrar add CNAME records: `api` → the ALB address (Part 5, without `http://`), `admin` → the admin CloudFront address, `@`/`www` → the website CloudFront address.

### 11.4 Payments
Online payments (UPI/cards) are a mock until a gateway is connected. Sign up with Razorpay or PhonePe for Business; the developer then wires their keys into `backend/src/modules/payments/payments.routes.ts`. Cash on delivery works today.

---

## Quick reference — the whole thing in 6 commands

```bash
aws configure --profile yesdhobi                                   # once (Part 4)
cd ~/yesdhobi/yes-dhobi/backend
AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh                  # API
AWS_PROFILE=yesdhobi bash infra/deploy-frontends.sh                # admin panel + website
PARAMS="CorsOrigins=https://ADMIN,https://WEB" AWS_PROFILE=yesdhobi bash infra/deploy-backend.sh   # allow the sites
```
