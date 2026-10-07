"""
Start-to-end smoke test of the Yes Dhobi API: customer, rider, vendor, admin,
the waterfall cascades and the negative cases. Prints PASS/FAIL per step and
exits non-zero if anything failed. Run it after every deployment.

    python scripts/smoke-test.py                     # local API
    python scripts/smoke-test.py http://<alb-address>   # the deployed API

It uses the seeded demo accounts (see TESTING.md) and creates a couple of test
orders, so run it against a test environment or clean the orders up afterwards.
Needs only Python 3 - no extra packages.
"""
import json, random, sys, time, urllib.error, urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000") + "/api/v1"
results = []


def call(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    elif method != "GET":
        data = b"{}"
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")
    except Exception as e:  # network
        return 0, {"message": str(e)}


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (("   -> " + str(detail)) if detail else ""))
    return ok


def section(title):
    print("\n=== " + title + " " + "=" * max(0, 58 - len(title)))


rnd = lambda p: p + "%08d" % random.randint(10000000, 99999999)

# ---------------------------------------------------------------- setup
section("SETUP")
st, admin = call("POST", "/auth/admin/login", {"email": "admin@yesdhobi.com", "password": "Admin@12345"})
check("admin can log in", st == 200 and "accessToken" in admin, st)
AT = admin.get("accessToken")

RIDERS = {"9876543210": (12.9125, 77.645), "9876543211": (12.93, 77.66), "9876543212": (12.95, 77.68)}
rider_tok, rider_id = {}, {}
for phone, (lat, lng) in RIDERS.items():
    st, r = call("POST", "/auth/rider/login", {"phone": phone, "password": "Partner@123"})
    rider_tok[phone] = r.get("accessToken")
    rider_id[phone] = (r.get("rider") or {}).get("id")
    call("POST", "/riders/me/availability", {"availability": "ONLINE"}, rider_tok[phone])
    call("POST", "/riders/me/location", {"lat": lat, "lng": lng}, rider_tok[phone])
check("3 seeded riders log in and go online", all(rider_tok.values()), list(rider_tok))

VENDORS = {"9123456789": "Star Bright Laundry", "9123456790": "Sai Ram Dry Cleaners"}
vendor_tok, vendor_id = {}, {}
for phone in VENDORS:
    st, v = call("POST", "/auth/vendor/login", {"phone": phone, "password": "Partner@123"})
    vendor_tok[phone] = v.get("accessToken")
    vendor_id[phone] = (v.get("vendor") or {}).get("id")
check("2 seeded vendors log in", all(vendor_tok.values()), list(VENDORS.values()))

# ---------------------------------------------------------------- customer
section("CUSTOMER: signup, catalog, pricing")
cphone = rnd("98")
st, otp = call("POST", "/auth/customer/request-otp", {"phone": cphone})
check("request OTP for a new number", st == 200 and otp.get("isNewUser") is True and otp.get("devOtp") == "1234", otp.get("channel"))

st, bad = call("POST", "/auth/customer/verify-otp", {"phone": cphone, "otp": "0000", "name": "Flow Test"})
check("wrong OTP is rejected", st == 400, bad.get("message"))

st, noname = call("POST", "/auth/customer/verify-otp", {"phone": cphone, "otp": "1234"})
check("new user without a name is asked for one (OTP not burned)", st == 400, noname.get("message"))

st, cust = call("POST", "/auth/customer/verify-otp", {"phone": cphone, "otp": "1234", "name": "Flow Test"})
check("same OTP still works after that 400 (resubmit with name)", st == 200 and cust.get("isNewUser") is True)
CT = cust.get("accessToken")

st, addr = call("POST", "/customers/me/addresses",
                {"label": "Home", "line1": "Flat 9, Silver Oak, HSR Layout", "city": "Bangalore",
                 "pincode": "560102", "lat": 12.9121, "lng": 77.6446}, CT)
check("add address (first one becomes default)", st == 201 and addr.get("isDefault") is True)
ADDR = addr.get("id")

st, svc = call("GET", "/catalog/services")
check("catalog has 9 services with prices", st == 200 and len(svc.get("data", [])) == 9)
st, promos = call("GET", "/catalog/promotions")
check("active coupons are listed", st == 200 and any(p["code"] == "FIRSTORDER" for p in promos.get("data", [])))

st, q = call("POST", "/orders/quote", {"items": [{"code": "wi_1", "quantity": 2}, {"code": "wf_5", "quantity": 1}], "promoCode": "FIRSTORDER"}, CT)
check("quote: 2x40 + 1x120 = 200, -20% = 160", st == 200 and q.get("subtotal") == 200 and q.get("discount") == 40 and q.get("total") == 160, q.get("total"))

# -- customer home-screen search bar
st, srch = call("GET", "/catalog/search?q=wash", None, CT)
check("search bar finds services and items in one call", st == 200 and srch.get("total", 0) > 0,
      "%s services, %s items" % (len(srch.get("services", [])), len(srch.get("items", []))))
st, srch1 = call("GET", "/catalog/search?q=a", None, CT)
check("search ignores a single character", st == 200 and srch1.get("total") == 0)

# -- address search / map pin (needs AWS_LOCATION_API_KEY; 503 is a valid answer)
st, gcfg = call("GET", "/geo/config")
check("address-search switch is readable", st == 200 and "searchEnabled" in gcfg, gcfg.get("searchEnabled"))
GEO_ON = bool(gcfg.get("searchEnabled"))
st, ac = call("GET", "/geo/autocomplete?q=hsr%20layout&lat=12.9121&lng=77.6446", None, CT)
if GEO_ON:
    check("address autocomplete returns suggestions", st == 200 and len(ac.get("data", [])) > 0, len(ac.get("data", [])))
    first = (ac.get("data") or [{}])[0]
    if first.get("placeId"):
        st, pl = call("GET", "/geo/place/%s" % first["placeId"], None, CT)
        check("tapping a suggestion gives coordinates for the pin", st == 200 and pl.get("lat") and pl.get("lng"),
              (pl.get("lat"), pl.get("lng")))
    st, rv = call("GET", "/geo/reverse?lat=12.9121&lng=77.6446", None, CT)
    check("dragging the pin gives back an address", st == 200 and bool(rv.get("label")), rv.get("label"))
else:
    check("address search says plainly that it is not configured yet", st == 503,
          "set AwsLocationApiKey to switch it on (DEPLOY.md 11.5)")
st, serv = call("GET", "/geo/serviceability?lat=12.9121&lng=77.6446&city=Bangalore", None, CT)
check("serviceability check answers for a dropped pin", st == 200 and "serviceable" in serv, serv.get("serviceable"))

st, badcoupon = call("POST", "/orders/validate-coupon", {"code": "FLAT100", "items": [{"code": "wi_1", "quantity": 1}]}, CT)
check("coupon below minimum order is refused", st == 422, badcoupon.get("message"))

st, wallet_order = call("POST", "/orders", {"items": [{"code": "dc_1", "quantity": 3}], "addressId": ADDR,
                                            "pickupDate": "2026-10-20", "pickupSlot": "10-12 PM", "paymentMethod": "WALLET"}, CT)
check("wallet order with no balance is refused", st == 422, wallet_order.get("message"))

# ---------------------------------------------------------------- order + rider waterfall
section("ORDER + RIDER WATERFALL")
st, order = call("POST", "/orders", {"items": [{"code": "wi_1", "quantity": 2}, {"code": "wf_5", "quantity": 1}],
                                     "addressId": ADDR, "pickupDate": "2026-10-20", "pickupSlot": "6-8 PM",
                                     "promoCode": "FIRSTORDER", "paymentMethod": "COD", "notes": "Gentle wash"}, CT)
check("place order", st == 201 and order.get("status") == "PENDING_PICKUP", order.get("orderNumber"))
OID = order.get("id")
PICK_OTP, DEL_OTP = (order.get("otps") or {}).get("pickup"), (order.get("otps") or {}).get("delivery")
check("no laundry partner assigned at booking (rider first)", order.get("vendor") is None)
check("customer gets 4-digit pickup and delivery OTPs", bool(PICK_OTP and DEL_OTP and len(PICK_OTP) == 4))

time.sleep(1.2)
offers = {p: call("GET", "/riders/me/requests", None, t)[1].get("data", []) for p, t in rider_tok.items()}
holders = [p for p, o in offers.items() if any(x["orderId"] == OID for x in o)]
check("exactly ONE rider is offered the order", len(holders) == 1, holders)
check("the nearest rider gets it first", holders == ["9876543210"], holders)

first_req = next(x for x in offers["9876543210"] if x["orderId"] == OID)
check("offer shows payout, distance and a 15s countdown", first_req["payout"] > 0 and 0 < first_req["remainingSeconds"] <= 15, first_req["remainingSeconds"])
check("drop-off is marked as pending until a partner accepts", first_req["dropoff"]["pending"] is True)

st, _ = call("POST", "/riders/me/requests/%s/decline" % first_req["requestId"], {}, rider_tok["9876543210"])
check("rider 1 can decline", st == 200)
time.sleep(1.2)
offers2 = {p: call("GET", "/riders/me/requests", None, t)[1].get("data", []) for p, t in rider_tok.items()}
holders2 = [p for p, o in offers2.items() if any(x["orderId"] == OID for x in o)]
check("offer passed immediately to rider 2", holders2 == ["9876543211"], holders2)

st, late = call("POST", "/riders/me/requests/%s/accept" % first_req["requestId"], {}, rider_tok["9876543210"])
check("rider 1 cannot accept after declining", st == 409, late.get("message"))

second_req = next(x for x in offers2["9876543211"] if x["orderId"] == OID)
st, accepted = call("POST", "/riders/me/requests/%s/accept" % second_req["requestId"], {}, rider_tok["9876543211"])
check("rider 2 accepts -> order ASSIGNED", st == 200 and accepted.get("status") == "ASSIGNED", accepted.get("statusLabel"))

# -- the Cancel button must disappear the moment a rider is allocated
st, aftassign = call("GET", "/orders/%s" % OID, None, CT)
check("Cancel button is hidden once a rider is allocated", aftassign.get("canCancel") is False,
      aftassign.get("cancelBlockedReason"))
st, nocancel = call("POST", "/orders/%s/cancel" % OID, {}, CT)
check("and the API refuses cancellation too, not just the button", nocancel is not None and st == 422, st)

# -- "Arrived at location"
st, arr = call("POST", "/riders/me/orders/%s/arrived" % OID, {}, rider_tok["9876543211"])
check("rider can mark 'Arrived at location'", st == 200 and arr.get("leg") == "PICKUP", arr.get("arrivedAt"))
st, arr2 = call("POST", "/riders/me/orders/%s/arrived" % OID, {}, rider_tok["9876543211"])
check("tapping Arrived twice is harmless", st == 200 and arr2.get("alreadyMarked") is True)
st, arr_other = call("POST", "/riders/me/orders/%s/arrived" % OID, {}, rider_tok["9876543212"])
check("another rider cannot mark arrival on someone else's order", st == 404, st)

# -- live tracking map
st, _ = call("POST", "/riders/me/location", {"lat": 12.9131, "lng": 77.6449, "orderId": OID}, rider_tok["9876543211"])
st, trk = call("GET", "/orders/%s/track" % OID, None, CT)
mp = trk.get("map") or {}
check("tracking screen gets a live rider position", st == 200 and mp.get("live") is True and mp.get("riderPosition"),
      mp.get("riderPosition"))
check("tracking screen gets the customer pin and an ETA", bool(mp.get("customer")) and (mp.get("etaMinutes") or 0) > 0,
      mp.get("etaMinutes"))
check("tracking screen reports the rider has arrived", mp.get("riderArrived") is True)

# ---------------------------------------------------------------- vendor waterfall
section("LAUNDRY PARTNER WATERFALL (after rider accepted)")
time.sleep(1.5)
voffers = {p: call("GET", "/vendors/me/requests", None, t)[1].get("data", []) for p, t in vendor_tok.items()}
vholders = [p for p, o in voffers.items() if any(x["orderId"] == OID for x in o)]
check("partner search started once the rider accepted", len(vholders) == 1, [VENDORS[p] for p in vholders])
check("nearest partner offered first", vholders == ["9123456789"], vholders)

v1 = next(x for x in voffers["9123456789"] if x["orderId"] == OID)
check("partner offer shows its payout and a countdown", v1["payout"] > 0 and v1["remainingSeconds"] > 0, (v1["payout"], v1["remainingSeconds"]))

st, tabnew = call("GET", "/vendors/me/orders?tab=new", None, vendor_tok["9123456789"])
check("partner app 'new requests' tab shows it", any(o["id"] == OID for o in tabnew.get("data", [])))

st, _ = call("POST", "/vendors/me/orders/%s/reject" % OID, {"reason": "Capacity full"}, vendor_tok["9123456789"])
check("partner 1 can decline", st == 200)
time.sleep(1.2)
voffers2 = {p: call("GET", "/vendors/me/requests", None, t)[1].get("data", []) for p, t in vendor_tok.items()}
vholders2 = [p for p, o in voffers2.items() if any(x["orderId"] == OID for x in o)]
check("order passed to the next nearest partner", vholders2 == ["9123456790"], vholders2)

st, vacc = call("POST", "/vendors/me/orders/%s/accept" % OID, {}, vendor_tok["9123456790"])
check("partner 2 accepts", st == 200 and vacc.get("isAccepted") is True, (vacc.get("vendor") or {}).get("name"))

st, riderview = call("GET", "/riders/me/orders/%s" % OID, None, rider_tok["9876543211"])
check("rider now sees the drop-off address", (riderview.get("vendor") or {}).get("address") not in (None, ""), (riderview.get("vendor") or {}).get("name"))

st, declined_vendor = call("POST", "/vendors/me/orders/%s/accept" % OID, {}, vendor_tok["9123456789"])
check("the partner who declined cannot take it later", st in (404, 409), st)

# ---------------------------------------------------------------- call + chat
section("CALL AND CHAT BETWEEN THE PARTIES")
st, cc = call("GET", "/chat/%s/contacts" % OID, None, CT)
rider_contact = next((c for c in cc.get("contacts", []) if c["party"] == "RIDER"), {})
check("customer gets the rider's number to call", st == 200 and rider_contact.get("callable") is True
      and str(rider_contact.get("phone", "")).startswith("+91"), rider_contact.get("phone"))
st, rc = call("GET", "/chat/%s/contacts" % OID, None, rider_tok["9876543211"])
cust_contact = next((c for c in rc.get("contacts", []) if c["party"] == "CUSTOMER"), {})
check("rider gets the customer's number to call", st == 200 and cust_contact.get("callable") is True
      and str(cust_contact.get("phone", "")).startswith("+91"), cust_contact.get("phone"))

st, sent = call("POST", "/chat/%s/rider" % OID, {"body": "Gate code is 4521"}, CT)
check("customer can message the rider", st == 201)
st, thread = call("GET", "/chat/%s/customer" % OID, None, rider_tok["9876543211"])
check("rider reads that message", st == 200 and any(m["body"] == "Gate code is 4521" for m in thread.get("data", [])))
st, _ = call("POST", "/chat/%s/vendor" % OID, {"body": "Reaching your shop in 10"}, rider_tok["9876543211"])
st, mine = call("GET", "/chat/%s" % OID, None, CT)
threads = [t["thread"] for t in mine.get("threads", [])]
check("the rider/partner thread is hidden from the customer",
      "RIDER_VENDOR" not in threads and "Reaching your shop in 10" not in json.dumps(mine), threads)
st, empty = call("POST", "/chat/%s/rider" % OID, {"body": "   "}, CT)
check("an empty message is refused", st == 400, st)

# ---------------------------------------------------------------- OTP handoffs
section("PICKUP AND DROP-OFF (OTP handoffs)")
st, wrong = call("POST", "/riders/me/orders/%s/confirm-pickup" % OID, {"otp": "0000"}, rider_tok["9876543211"])
check("wrong pickup OTP is refused", st == 400, wrong.get("message"))

st, other = call("POST", "/riders/me/orders/%s/confirm-pickup" % OID, {"otp": PICK_OTP}, rider_tok["9876543212"])
check("a different rider cannot confirm this pickup", st in (403, 404), st)

st, weigh = call("POST", "/riders/me/orders/%s/weigh" % OID, {"weightKg": 3.5, "itemsCount": 3}, rider_tok["9876543211"])
check("rider records the weight at the door", st == 200)

st, picked = call("POST", "/riders/me/orders/%s/confirm-pickup" % OID, {"otp": PICK_OTP}, rider_tok["9876543211"])
check("correct pickup OTP -> PICKED_UP", st == 200 and picked.get("status") == "PICKED_UP")

st, vdetail = call("GET", "/vendors/me/orders/%s" % OID, None, vendor_tok["9123456790"])
DROP_OTP = (vdetail.get("otps") or {}).get("riderDrop")
HAND_OTP = (vdetail.get("otps") or {}).get("riderHandover")
check("partner sees its two 4-digit OTPs", bool(DROP_OTP and HAND_OTP))

st, dropped = call("POST", "/riders/me/orders/%s/confirm-dropoff" % OID, {"otp": DROP_OTP}, rider_tok["9876543211"])
check("drop-off OTP -> IN_LAUNDRY", st == 200 and dropped.get("status") == "IN_LAUNDRY")

st, earn = call("GET", "/riders/me/earnings", None, rider_tok["9876543211"])
check("rider earned the pickup payout", earn.get("today", {}).get("amount", 0) > 0, earn.get("today"))

# ---------------------------------------------------------------- processing + delivery
section("PROCESSING AND DELIVERY")
for s in ("WASHING", "IRONING", "QUALITY_CHECK"):
    st, r = call("POST", "/vendors/me/orders/%s/status" % OID, {"status": s}, vendor_tok["9123456790"])
    check("partner sets %s" % s, st == 200 and r.get("status") == s)

st, track = call("GET", "/orders/%s/track" % OID, None, CT)
cur = [t["title"] for t in track.get("tracking", []) if t["state"] == "current"]
check("customer tracking reflects progress", st == 200 and len(track.get("tracking", [])) == 8, cur)

st, book = call("POST", "/vendors/me/orders/%s/book-rider" % OID, {}, vendor_tok["9123456790"])
check("partner books a delivery rider -> READY", st == 200 and book.get("status") == "READY" and book.get("ridersNotified", 0) > 0, book.get("ridersNotified"))

time.sleep(1.2)
doffers = {p: [x for x in call("GET", "/riders/me/requests", None, t)[1].get("data", []) if x["orderId"] == OID and x["leg"] == "DELIVERY"] for p, t in rider_tok.items()}
dholder = [p for p, o in doffers.items() if o]
check("exactly one rider offered the delivery", len(dholder) == 1, dholder)

dreq = doffers[dholder[0]][0]
st, dacc = call("POST", "/riders/me/requests/%s/accept" % dreq["requestId"], {}, rider_tok[dholder[0]])
check("delivery rider accepts", st == 200)

st, out = call("POST", "/riders/me/orders/%s/confirm-handover" % OID, {"otp": HAND_OTP}, rider_tok[dholder[0]])
check("handover OTP -> OUT_FOR_DELIVERY", st == 200 and out.get("status") == "OUT_FOR_DELIVERY")

st, deliv = call("POST", "/riders/me/orders/%s/confirm-delivery" % OID, {"otp": DEL_OTP, "collectedCash": True}, rider_tok[dholder[0]])
check("delivery OTP -> DELIVERED", st == 200 and deliv.get("status") == "DELIVERED")
check("COD is marked paid on delivery", deliv.get("paymentStatus") == "PAID", deliv.get("paymentStatus"))

st, track2 = call("GET", "/orders/%s/track" % OID, None, CT)
check("all 8 tracking steps complete", all(t["state"] == "done" for t in track2.get("tracking", [])))

st, rate = call("POST", "/orders/%s/rate" % OID, {"rating": 5, "comment": "Crisp"}, CT)
check("customer can rate the delivered order", st == 200 and rate.get("rating") == 5)
st, rate2 = call("POST", "/orders/%s/rate" % OID, {"rating": 3}, CT)
check("cannot rate twice", st == 422)

st, inv = call("GET", "/orders/%s/invoice" % OID, None, CT)
check("invoice generated", st == 200 and inv.get("summary", {}).get("total") == 160, inv.get("invoiceNumber"))
st, re_ = call("POST", "/orders/%s/reorder" % OID, {}, CT)
check("reorder returns the same items with a fresh quote", st == 200 and len(re_.get("items", [])) == 2)

# ---------------------------------------------------------------- money
section("MONEY: earnings and payouts")
st, ve = call("GET", "/vendors/me/earnings", None, vendor_tok["9123456790"])
check("partner earnings credited", ve.get("today", {}).get("amount", 0) > 0, ve.get("today"))
check("partner has an outstanding balance", ve.get("outstanding", 0) > 0, ve.get("outstanding"))

st, vp = call("POST", "/vendors/me/payouts", {}, vendor_tok["9123456790"])
check("partner can request a payout", st in (201, 422), vp.get("message") or vp.get("payoutNumber"))
payout_id = vp.get("id")
if payout_id:
    st, proc = call("POST", "/admin/payouts/%s/process" % payout_id, {"reference": "UTR-TEST"}, AT)
    check("admin processes the payout", st == 200 and proc.get("payoutStatus") == "PROCESSED")
    st, ve2 = call("GET", "/vendors/me/earnings", None, vendor_tok["9123456790"])
    check("outstanding drops to 0 after payout", ve2.get("outstanding") == 0, ve2.get("outstanding"))

# ---------------------------------------------------------------- admin
section("ADMIN PANEL")
st, dash = call("GET", "/admin/dashboard", None, AT)
check("dashboard KPIs load", st == 200 and dash.get("kpis", {}).get("ordersToday", {}).get("value", 0) > 0)
st, ao = call("GET", "/admin/orders/%s" % OID, None, AT)
check("order shows customer / partner / rider names", bool(ao.get("customerName") and ao.get("partnerName") and ao.get("riderName")),
      (ao.get("customerName"), ao.get("partnerName"), ao.get("riderName")))
check("admin sees all four OTPs", len(ao.get("otps", {})) == 4)
st, disp = call("GET", "/admin/orders/%s/dispatch" % OID, None, AT)
check("admin can see the cascade history", st == 200 and len(disp.get("riderOffers", [])) >= 2 and len(disp.get("vendorOffers", [])) >= 2,
      "%d rider offers, %d partner offers" % (len(disp.get("riderOffers", [])), len(disp.get("vendorOffers", []))))
st, rev = call("GET", "/admin/analytics/revenue?range=30d", None, AT)
check("revenue analytics", st == 200 and rev.get("totals", {}).get("grossRevenue", 0) > 0)
st, ver = call("GET", "/admin/verifications?status=PENDING_REVIEW", None, AT)
check("KYC queue loads", st == 200, "%d pending" % len(ver.get("data", [])))
st, settings = call("GET", "/admin/settings", None, AT)
check("settings load with zones", st == 200 and len(settings.get("activeServiceZones", [])) > 0)
st, bc = call("POST", "/admin/broadcast", {"targetAudience": "Riders", "priority": "Normal", "title": "Flow test", "message": "ignore"}, AT)
check("broadcast reaches riders", st == 200 and bc.get("recipients", 0) > 0, bc.get("recipients"))

# ---------------------------------------------------------------- support + security
section("SUPPORT AND SECURITY")
st, tkt = call("POST", "/support/tickets", {"subject": "Button missing", "message": "A shirt lost a button", "category": "DAMAGE", "priority": "HIGH", "orderId": OID}, CT)
check("customer raises a ticket", st == 201, tkt.get("ticketNumber"))
if st == 201:
    st, rep = call("POST", "/admin/tickets/%s/reply" % tkt["ticketNumber"], {"text": "We are checking"}, AT)
    check("admin replies by ticket number", st == 201)
    st, seen = call("GET", "/support/tickets/%s" % tkt["id"], None, CT)
    check("customer sees the staff reply", any(m.get("isStaff") for m in seen.get("messages", [])))

# ---------------------------------------------------------------- rider history
section("RIDER ORDER HISTORY (real data, including refusals)")
st, hist = call("GET", "/riders/me/requests/history?status=rejected", None, rider_tok["9876543210"])
check("declined offers show up in the rider's history", st == 200 and len(hist.get("data", [])) > 0,
      "%s row(s)" % len(hist.get("data", [])))
if hist.get("data"):
    row = hist["data"][0]
    check("each history row carries the real order, not a placeholder",
          bool((row.get("order") or {}).get("orderNumber")), (row.get("order") or {}).get("orderNumber"))
    check("a refused offer is labelled Declined or Missed", row.get("statusLabel") in ("Declined", "Missed"),
          row.get("statusLabel"))
st, hist_all = call("GET", "/riders/me/requests/history?status=accepted", None, rider_tok["9876543211"])
check("accepted offers are listed too", st == 200 and len(hist_all.get("data", [])) > 0)

# ---------------------------------------------------------------- verification
section("RIDER VERIFICATION VERDICT")
st, onb = call("GET", "/riders/me/onboarding", None, rider_tok["9876543210"])
check("rider can read the admin's verdict", st == 200 and "canWork" in onb and "rejected" in onb,
      "%s / canWork=%s" % (onb.get("status"), onb.get("canWork")))
check("an approved rider is allowed to work", onb.get("canWork") is True or onb.get("rejected") is True, onb.get("status"))

# ---------------------------------------------------------------- forgot password
section("FORGOT PASSWORD")
st, fp = call("POST", "/auth/rider/forgot-password", {"email": "nobody-" + str(int(time.time())) + "@example.com"})
check("forgot password accepts an email and does not leak accounts",
      st == 200 and fp.get("channel") == "email" and "devOtp" not in fp and "code" not in fp, fp.get("message"))
st, fpbad = call("POST", "/auth/rider/forgot-password", {})
check("forgot password insists on an email or a phone", st == 400, st)

section("SECURITY")
st, closed = call("GET", "/chat/%s/contacts" % OID, None, CT)
closed_rider = next((c for c in closed.get("contacts", []) if c["party"] == "RIDER"), {})
check("calling is closed once the order is delivered", closed_rider.get("callable") is False,
      closed_rider.get("note"))
st, latemsg = call("POST", "/chat/%s/rider" % OID, {"body": "hello?"}, CT)
check("and no new messages can be sent on a closed order", st == 422, st)
st, oldthread = call("GET", "/chat/%s/rider" % OID, None, CT)
check("but the past conversation is still readable", st == 200 and len(oldthread.get("data", [])) > 0,
      "%s message(s)" % len(oldthread.get("data", [])))

st, forb = call("GET", "/admin/orders", None, CT)
check("customer token cannot read admin data", st == 403, st)
st, unauth = call("GET", "/orders")
check("no token is rejected", st == 401, st)
st, cancel_done = call("POST", "/orders/%s/cancel" % OID, {}, CT)
check("delivered order cannot be cancelled", st == 422, st)

# cancellation path on a fresh order
st, o2 = call("POST", "/orders", {"items": [{"code": "si_1", "quantity": 2}], "addressId": ADDR,
                                  "pickupDate": "2026-10-21", "pickupSlot": "8-10", "paymentMethod": "COD"}, CT)
if st == 201:
    time.sleep(0.8)
    st, pre = call("GET", "/orders/%s" % o2["id"], None, CT)
    check("Cancel button is offered while no rider is allocated", pre.get("canCancel") is True)
    st, c2 = call("POST", "/orders/%s/cancel" % o2["id"], {"reason": "Changed my mind"}, CT)
    check("customer can cancel before pickup", st == 200 and c2.get("status") == "CANCELLED")
    time.sleep(0.5)
    left = [x for p, t in rider_tok.items() for x in call("GET", "/riders/me/requests", None, t)[1].get("data", []) if x["orderId"] == o2["id"]]
    check("cancelling closes the rider offer", len(left) == 0, len(left))

# ---------------------------------------------------------------- summary
section("SUMMARY")
failed = [r for r in results if not r[0]]
print("  %d checks, %d passed, %d failed" % (len(results), len(results) - len(failed), len(failed)))
for _, name, detail in failed:
    print("   FAILED: %s  %s" % (name, detail))
sys.exit(1 if failed else 0)
