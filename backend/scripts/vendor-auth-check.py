"""Onboarding form -> backend -> admin panel -> vendor app login, end to end."""
import json, random, sys, urllib.error, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000").rstrip("/") + "/api/v1"
sys.stdout.reconfigure(encoding="utf-8")
results = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (("   -> %s" % detail) if detail else ""))


phone = "9%09d" % random.randint(0, 999999999)
payload = {
    "personalDetails": {"fullName": "E2E Partner", "mobileNumber": "+91" + phone,
                        "personalCity": "New Delhi", "currentAddress": "1 Test St"},
    "businessDetails": {"shopName": "E2E Partner Laundry", "isExistingFranchise": False,
                        "panNumber": "ABCDE1234F", "dailyCapacityKg": 100},
    "location": {"shopAddress": "Shop 1", "pincode": "110024", "city": "New Delhi",
                 "latitude": 28.5, "longitude": 77.2},
    "documents": {},
    "bankDetails": {"bankAccountHolderName": "E2E Partner", "bankName": "HDFC",
                    "bankAccountNumber": "50100234567890", "bankIfscCode": "HDFC0001234"},
    "services": [{"serviceId": 1, "price": 40, "isEnabled": True}],
    "equipments": [], "serviceAreas": [1], "workingDays": [1],
    "agreedToPartnerTerms": True, "agreedToPaymentTerms": True,
    "consentedToBackgroundVerification": True,
}

print("=" * 66)
print("VENDOR: onboarding form -> admin approval -> app login")
print("=" * 66)

# 1. the onboarding form
st, reg = call("POST", "/vendors", payload)
REG_ID = reg.get("registrationId", "")
PASSWORD = reg.get("temporaryPassword", "")
check("form submission issues a Registration ID", st == 201 and REG_ID.startswith("VD"), REG_ID)
check("and a temporary password to show the partner", bool(PASSWORD) and len(PASSWORD) >= 8, PASSWORD)
check("credentials are marked inactive until approval", reg.get("credentialsActive") is False)

# 2. the password is never stored in the clear
st, admin = call("POST", "/auth/admin/login", {"email": "admin@yesdhobi.com", "password": "Admin@12345"})
AT = admin.get("accessToken")
st, listing = call("GET", "/admin/vendors?search=E2E%20Partner%20Laundry&limit=20", None, AT)
row = next((v for v in listing.get("data", []) if v.get("registrationId") == REG_ID), None)
check("the admin panel shows the Registration ID", row is not None, (row or {}).get("registrationId"))
check("no password is exposed anywhere in the admin payload",
      PASSWORD not in json.dumps(listing), "searched the whole response")

# 3. login must be refused before approval
st, denied = call("POST", "/auth/vendor/login", {"registrationId": REG_ID, "password": PASSWORD})
check("login by Registration ID is refused while under review", st == 403,
      denied.get("message", "")[:60])
st, denied2 = call("POST", "/auth/vendor/login", {"phone": phone, "password": PASSWORD})
check("login by mobile is refused too", st == 403, denied2.get("message", "")[:40])

# 4. admin approves
st, pending = call("GET", "/admin/verifications?status=PENDING_REVIEW&limit=100", None, AT)
v = next((x for x in pending.get("data", []) if x.get("vendorId") == reg.get("vendorId")), None)
check("the application is waiting in the admin KYC queue", v is not None)
if v:
    st, _ = call("POST", "/admin/verifications/%s/approve" % v["id"], {}, AT)
    check("admin approves it", st == 200)

# 5. now the credentials work
st, ok = call("POST", "/auth/vendor/login", {"registrationId": REG_ID, "password": PASSWORD})
check("login with Registration ID + password now succeeds", st == 200 and bool(ok.get("accessToken")),
      (ok.get("vendor") or {}).get("status"))
check("the app is told its Registration ID", (ok.get("vendor") or {}).get("registrationId") == REG_ID)
st, lower = call("POST", "/auth/vendor/login", {"registrationId": REG_ID.lower(), "password": PASSWORD})
check("lower case works too, as typed on a phone", lower.get("accessToken") is not None)

# 6. the token actually opens the partner app
VT = ok.get("accessToken")
st, me = call("GET", "/vendors/me", None, VT)
check("the token opens the partner app", st == 200 and me.get("registrationId") == REG_ID, me.get("shopName"))
st, orders = call("GET", "/vendors/me/orders?tab=new", None, VT)
check("and the new-requests queue loads", st == 200)

# 7. wrong password still refused
st, bad = call("POST", "/auth/vendor/login", {"registrationId": REG_ID, "password": "wrong-password"})
check("a wrong password is still refused after approval", st == 401)

print("=" * 66)
failed = [r for r in results if not r[0]]
print("  %d checks, %d passed, %d failed" % (len(results), len(results) - len(failed), len(failed)))
for _, name, detail in failed:
    print("   FAILED: %s  %s" % (name, detail))
sys.exit(1 if failed else 0)
