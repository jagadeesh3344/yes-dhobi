/**
 * Seeds reference data (services, catalog, zones, equipment, promos, surcharges,
 * FAQs, settings) plus an admin user and a small demo fleet.
 * Idempotent: safe to run repeatedly.  `npm run db:seed`
 */
import 'dotenv/config';
import { PrismaClient, type RateUnit } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@yesdhobi.com').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const DEMO_PASSWORD = 'Partner@123';

// ids 1..9 match SERVICE_ID_MAP in the vendor web app
const SERVICES: { code: string; name: string; description: string; rateUnit: RateUnit; basePrice: number; leadTimeHours: number; iconName: string }[] = [
  { code: 'wash_fold', name: 'Wash & Fold', description: 'Everyday wear washed with premium detergent, tumble dried and folded crisp.', rateUnit: 'KG', basePrice: 60, leadTimeHours: 24, iconName: 'WashingMachine' },
  { code: 'wash_iron', name: 'Wash & Iron', description: 'Machine wash and dry followed by high-quality ironing.', rateUnit: 'KG', basePrice: 80, leadTimeHours: 48, iconName: 'Shirt' },
  { code: 'steam_iron', name: 'Steam Iron', description: 'Professional steam pressing for wrinkle-free crisp garments.', rateUnit: 'ITEM', basePrice: 15, leadTimeHours: 24, iconName: 'Wind' },
  { code: 'dry_iron', name: 'Dry Iron', description: 'Classic dry ironing for cottons and daily wear.', rateUnit: 'ITEM', basePrice: 10, leadTimeHours: 24, iconName: 'Wind' },
  { code: 'dry_cleaning', name: 'Dry Cleaning', description: 'Specialised solvent cleaning for delicate fabrics, suits and designer apparel.', rateUnit: 'ITEM', basePrice: 120, leadTimeHours: 72, iconName: 'Shirt' },
  { code: 'shoe_cleaning', name: 'Shoe Cleaning', description: 'Professional shoe cleaning without harming the material.', rateUnit: 'PAIR', basePrice: 199, leadTimeHours: 48, iconName: 'Footprints' },
  { code: 'stain_removal', name: 'Stain Removal', description: 'Targeted treatment for tough, stubborn fabric spots.', rateUnit: 'SPOT', basePrice: 80, leadTimeHours: 48, iconName: 'Droplets' },
  { code: 'households', name: 'Household', description: 'Heavy-duty wash for sheets, drapes, quilts and thick blankets.', rateUnit: 'ITEM', basePrice: 120, leadTimeHours: 48, iconName: 'BedDouble' },
  { code: 'wet_cleaning', name: 'Wet Cleaning', description: 'Gentle water-based cleaning for garments marked dry-clean-only.', rateUnit: 'ITEM', basePrice: 90, leadTimeHours: 72, iconName: 'Droplets' },
];

// mirrors customer/lib/state/cart_manager.dart
const ITEMS: { code: string; service: string; name: string; price: number; unit?: string; iconKey: string }[] = [
  { code: 'wf_1', service: 'wash_fold', name: 'Shirt', price: 40, iconKey: 'shirt' },
  { code: 'wf_2', service: 'wash_fold', name: 'T-Shirt', price: 30, iconKey: 'tshirt' },
  { code: 'wf_3', service: 'wash_fold', name: 'Jeans', price: 50, iconKey: 'jeans' },
  { code: 'wf_4', service: 'wash_fold', name: 'Saree', price: 80, iconKey: 'saree' },
  { code: 'wf_5', service: 'wash_fold', name: 'Bedsheet', price: 120, iconKey: 'bedsheet' },
  { code: 'wf_6', service: 'wash_fold', name: 'Towel', price: 35, iconKey: 'towel' },
  { code: 'wf_7', service: 'wash_fold', name: 'Kurta', price: 45, iconKey: 'shirt' },
  { code: 'wf_8', service: 'wash_fold', name: 'Shorts / Pyjamas', price: 30, iconKey: 'jeans' },
  { code: 'wi_1', service: 'wash_iron', name: 'Shirt', price: 40, iconKey: 'shirt' },
  { code: 'wi_2', service: 'wash_iron', name: 'T-Shirt', price: 30, iconKey: 'tshirt' },
  { code: 'wi_3', service: 'wash_iron', name: 'Formal Trousers', price: 50, iconKey: 'jeans' },
  { code: 'wi_4', service: 'wash_iron', name: 'Silk / Cotton Saree', price: 110, iconKey: 'saree' },
  { code: 'wi_5', service: 'wash_iron', name: 'Double Bedsheet', price: 90, iconKey: 'bedsheet' },
  { code: 'si_1', service: 'steam_iron', name: 'Shirt / Top', price: 25, iconKey: 'shirt' },
  { code: 'si_2', service: 'steam_iron', name: 'T-Shirt', price: 20, iconKey: 'tshirt' },
  { code: 'si_3', service: 'steam_iron', name: 'Trousers / Jeans', price: 30, iconKey: 'jeans' },
  { code: 'si_4', service: 'steam_iron', name: 'Saree Press', price: 50, iconKey: 'saree' },
  { code: 'dc_1', service: 'dry_cleaning', name: '2-Piece Suit', price: 299, iconKey: 'shirt' },
  { code: 'dc_2', service: 'dry_cleaning', name: 'Heavy Saree / Lehenga', price: 199, iconKey: 'saree' },
  { code: 'dc_3', service: 'dry_cleaning', name: 'Blazer / Coat', price: 180, iconKey: 'shirt' },
  { code: 'dc_4', service: 'dry_cleaning', name: 'Winter Jacket / Sweater', price: 149, iconKey: 'shirt' },
  { code: 'sc_1', service: 'shoe_cleaning', name: 'Sneakers / Sports Shoes', price: 199, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_2', service: 'shoe_cleaning', name: 'Leather Shoes Spa', price: 249, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_3', service: 'shoe_cleaning', name: 'Suede / Boots', price: 299, unit: 'pair', iconKey: 'shoes' },
  { code: 'hh_1', service: 'households', name: 'Quilt / Comforter', price: 299, iconKey: 'bedsheet' },
  { code: 'hh_2', service: 'households', name: 'Curtains (Pair)', price: 349, iconKey: 'towel' },
  { code: 'hh_3', service: 'households', name: 'Blanket (Double)', price: 249, iconKey: 'bedsheet' },
];

// ids 1..10 match ZONE_MAP in the vendor web app; the rest come from the admin demo data
const ZONES = [
  { name: 'Lajpat Nagar', city: 'New Delhi', state: 'Delhi', centerLat: 28.5677, centerLng: 77.2433 },
  { name: 'Saket', city: 'New Delhi', state: 'Delhi', centerLat: 28.5245, centerLng: 77.2066 },
  { name: 'Hauz Khas', city: 'New Delhi', state: 'Delhi', centerLat: 28.5494, centerLng: 77.2001 },
  { name: 'Karol Bagh', city: 'New Delhi', state: 'Delhi', centerLat: 28.6519, centerLng: 77.1909 },
  { name: 'Dwarka', city: 'New Delhi', state: 'Delhi', centerLat: 28.5921, centerLng: 77.046 },
  { name: 'Rohini', city: 'New Delhi', state: 'Delhi', centerLat: 28.7495, centerLng: 77.0565 },
  { name: 'Connaught Place', city: 'New Delhi', state: 'Delhi', centerLat: 28.6315, centerLng: 77.2167 },
  { name: 'Janakpuri', city: 'New Delhi', state: 'Delhi', centerLat: 28.6219, centerLng: 77.0878 },
  { name: 'Vasant Kunj', city: 'New Delhi', state: 'Delhi', centerLat: 28.5206, centerLng: 77.1571 },
  { name: 'Greater Kailash', city: 'New Delhi', state: 'Delhi', centerLat: 28.5484, centerLng: 77.2382 },
  { name: 'Indiranagar', city: 'Bangalore', state: 'Karnataka', centerLat: 12.9784, centerLng: 77.6408 },
  { name: 'HSR Layout', city: 'Bangalore', state: 'Karnataka', centerLat: 12.9121, centerLng: 77.6446 },
  { name: 'Koramangala', city: 'Bangalore', state: 'Karnataka', centerLat: 12.9352, centerLng: 77.6245 },
  { name: 'Bellandur', city: 'Bangalore', state: 'Karnataka', centerLat: 12.9257, centerLng: 77.6749 },
  { name: 'Andheri West', city: 'Mumbai', state: 'Maharashtra', centerLat: 19.1364, centerLng: 72.8296 },
  { name: 'Bandra', city: 'Mumbai', state: 'Maharashtra', centerLat: 19.0596, centerLng: 72.8295 },
  { name: 'Kothrud', city: 'Pune', state: 'Maharashtra', centerLat: 18.5074, centerLng: 73.8077 },
  { name: 'Viman Nagar', city: 'Pune', state: 'Maharashtra', centerLat: 18.5679, centerLng: 73.9143 },
];

// ids 1..9 match EQUIPMENT_ID_MAP in the vendor web app
const EQUIPMENT = ['Washing Machine', 'Industrial Dryer', 'Steam Iron', 'Dry cleaning machine', 'Wet Cleaning machine', 'Shoe cleaning', 'Spotting machine', 'Rolling machine', 'Dry Iron'];

const FAQS = [
  { category: 'Pickup', question: 'How do I schedule a pickup?', answer: 'Open the app, choose your items, pick a date and time slot, and confirm. A rider will arrive in your slot with a 4-digit OTP handoff.' },
  { category: 'Pickup', question: 'Can I change my pickup address or time slot?', answer: 'Yes, until a rider is assigned. Open the order and tap Edit, or contact support after assignment.' },
  { category: 'Delivery', question: 'What are your delivery timelines?', answer: 'Wash & Fold and Ironing are delivered within 24 hours, Wash & Iron in 48 hours and Dry Cleaning in 72 hours. Express delivery is available at checkout.' },
  { category: 'Delivery', question: 'How does delivery tracking work?', answer: 'Every order moves through Order Placed, Pickup, Washing, Quality Check, Out for Delivery and Delivered. Track it live from the Track Order screen.' },
  { category: 'Payments', question: 'What payment methods do you support?', answer: 'UPI, credit/debit cards, Yes Dhobi wallet and cash on delivery.' },
  { category: 'Orders', question: 'What if an item is damaged or missing?', answer: 'Raise a ticket from Help & Support within 24 hours of delivery. Our team will investigate and process a refund or re-clean.' },
];

async function main() {
  console.log('Seeding reference data ...');

  // sequences used for order / payout / ticket numbers
  for (const [seq, start] of [
    ['order_number_seq', 100001],
    ['payout_number_seq', 10001],
    ['ticket_number_seq', 1001],
  ] as const) {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${seq} START WITH ${start}`);
  }

  await prisma.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  for (const [i, s] of SERVICES.entries()) {
    await prisma.serviceCategory.upsert({ where: { code: s.code }, update: { name: s.name, description: s.description, rateUnit: s.rateUnit, iconName: s.iconName, sortOrder: i + 1 }, create: { ...s, sortOrder: i + 1 } });
  }
  const services = await prisma.serviceCategory.findMany();
  const svc = (code: string) => services.find((s) => s.code === code)!;

  for (const [i, it] of ITEMS.entries()) {
    await prisma.catalogItem.upsert({
      where: { code: it.code },
      update: { name: it.name, iconKey: it.iconKey, sortOrder: i + 1 },
      create: { code: it.code, serviceCategoryId: svc(it.service).id, name: it.name, price: it.price, unit: it.unit ?? 'pc', iconKey: it.iconKey, sortOrder: i + 1 },
    });
  }

  for (const z of ZONES) {
    await prisma.zone.upsert({ where: { name_city: { name: z.name, city: z.city } }, update: { centerLat: z.centerLat, centerLng: z.centerLng }, create: { ...z, radiusKm: 8 } });
  }
  for (const name of EQUIPMENT) await prisma.equipment.upsert({ where: { name }, update: {}, create: { name } });

  const year = new Date();
  year.setFullYear(year.getFullYear() + 1);
  const promos = [
    { code: 'FIRST50', title: '50% Off First Laundry Order', type: 'PERCENTAGE' as const, discountValue: 50, maxDiscount: 150, minOrder: 199, maxUses: 1000, firstOrderOnly: true, description: 'New customers get 50% off (max ₹150).' },
    { code: 'FIRSTORDER', title: '20% Off Your First Order', type: 'PERCENTAGE' as const, discountValue: 20, minOrder: 0, maxUses: null, firstOrderOnly: true, description: 'Get 20% off your very first laundry or dry clean order!' },
    { code: 'FIRST20', title: '20% Off', type: 'PERCENTAGE' as const, discountValue: 20, maxDiscount: 100, minOrder: 149, maxUses: null, firstOrderOnly: false, description: 'Flat 20% off on orders above ₹149.' },
    { code: 'FLAT100', title: '₹100 Off Dry Cleaning', type: 'FLAT' as const, discountValue: 100, minOrder: 499, maxUses: 500, firstOrderOnly: false, description: '₹100 off on orders above ₹499.' },
    { code: 'FREEDEL', title: 'Free Delivery', type: 'FREE_DELIVERY' as const, discountValue: 0, minOrder: 0, maxUses: null, firstOrderOnly: false, description: 'No delivery fee on any order.' },
  ];
  for (const p of promos) {
    await prisma.promotion.upsert({ where: { code: p.code }, update: { title: p.title, description: p.description }, create: { ...p, perUserLimit: p.firstOrderOnly ? 1 : 5, validUntil: year } });
  }

  if ((await prisma.surchargeRule.count()) === 0) {
    await prisma.surchargeRule.createMany({
      data: [
        { name: 'Express 24-Hr Delivery', description: 'Selected at checkout by user', kind: 'MULTIPLIER', value: 1.5, condition: 'EXPRESS_SELECTED' },
        { name: 'Sunday Pickup Surcharge', description: 'Scheduled slots on Sundays', kind: 'FLAT', value: 50, condition: 'SUNDAY_PICKUP' },
        { name: 'Heavy Load Discount', description: 'Order weight exceeds 10kg', kind: 'PERCENT_DISCOUNT', value: 10, condition: 'WEIGHT_OVER', threshold: 10 },
        { name: 'Festival/Holiday Rate', description: 'Active on national dry days', kind: 'MULTIPLIER', value: 1.2, condition: 'HOLIDAY', isActive: false },
      ],
    });
  }

  if ((await prisma.faq.count()) === 0) await prisma.faq.createMany({ data: FAQS.map((f, i) => ({ ...f, sortOrder: i + 1 })) });

  // ---- users ----------------------------------------------------------------
  await prisma.user.upsert({
    where: { email_role: { email: ADMIN_EMAIL, role: 'ADMIN' } },
    update: {},
    create: { role: 'ADMIN', email: ADMIN_EMAIL, name: 'Yes Dhobi Admin', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) },
  });

  const zones = await prisma.zone.findMany();
  const zone = (name: string) => zones.find((z) => z.name === name)!;
  const partnerHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const vendors = [
    { phone: '+919123456789', owner: 'Rajesh Kumar', shop: 'Star Bright Laundry', address: 'Shop No. 12, Sector 15, HSR Layout', city: 'Bangalore', lat: 12.9121, lng: 77.6446, zone: 'HSR Layout' },
    { phone: '+919123456790', owner: 'Suresh Pillai', shop: 'Sai Ram Dry Cleaners', address: '4th Block, Koramangala', city: 'Bangalore', lat: 12.9352, lng: 77.6245, zone: 'Koramangala' },
    { phone: '+919123456791', owner: 'Mohan Lal', shop: 'Krishna Dhobi Shop', address: 'Market Complex, Lajpat Nagar', city: 'New Delhi', lat: 28.5677, lng: 77.2433, zone: 'Lajpat Nagar' },
  ];
  for (const v of vendors) {
    const existing = await prisma.user.findUnique({ where: { phone_role: { phone: v.phone, role: 'VENDOR' } } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        role: 'VENDOR',
        phone: v.phone,
        name: v.owner,
        passwordHash: partnerHash,
        vendor: {
          create: {
            shopName: v.shop,
            ownerName: v.owner,
            shopAddress: v.address,
            city: v.city,
            latitude: v.lat,
            longitude: v.lng,
            status: 'ACTIVE',
            rating: 4.8,
            ratingCount: 120,
            dailyCapacityKg: 150,
            zones: { create: [{ zoneId: zone(v.zone).id }] },
            services: { create: services.map((s) => ({ serviceCategoryId: s.id, price: s.basePrice, unit: s.rateUnit === 'KG' ? 'kg' : s.rateUnit === 'PAIR' ? 'pair' : 'piece' })) },
            equipments: { create: [{ equipmentId: 1, quantity: 3 }, { equipmentId: 3, quantity: 2 }] },
          },
        },
      },
    });
  }

  const riders = [
    { phone: '+919876543210', name: 'Rahul Yadav', zone: 'HSR Layout', lat: 12.915, lng: 77.64, plate: 'KA-01-EQ-4421' },
    { phone: '+919876543211', name: 'Sunil Kumar', zone: 'Koramangala', lat: 12.934, lng: 77.62, plate: 'KA-05-AB-1234' },
    { phone: '+919876543212', name: 'Zack Colah', zone: 'Lajpat Nagar', lat: 28.568, lng: 77.243, plate: 'DL-3C-AZ-9087' },
  ];
  for (const r of riders) {
    const existing = await prisma.user.findUnique({ where: { phone_role: { phone: r.phone, role: 'RIDER' } } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        role: 'RIDER',
        phone: r.phone,
        name: r.name,
        passwordHash: partnerHash,
        rider: { create: { vehicleType: 'SCOOTER', vehicleNumber: r.plate, zoneId: zone(r.zone).id, onboardingStatus: 'APPROVED', availability: 'ONLINE', currentLat: r.lat, currentLng: r.lng, lastLocationAt: new Date(), rating: 4.9, ratingCount: 80, totalDeliveries: 240, upiId: `${r.name.split(' ')[0]!.toLowerCase()}@okaxis` } },
      },
    });
  }

  const customers = [
    { phone: '+919876511223', name: 'Sneha Kapoor', email: 'sneha@example.com', address: 'Flat 402, Palm Heights, Indiranagar', city: 'Bangalore', pincode: '560038', lat: 12.9784, lng: 77.6408 },
    { phone: '+919712344556', name: 'Amit Patel', email: 'amit@example.com', address: 'Villa 12, Green Glen Layout, Bellandur', city: 'Bangalore', pincode: '560103', lat: 12.9257, lng: 77.6749 },
    { phone: '+919876543000', name: 'Rahul Sharma', email: 'rahul@gmail.com', address: 'Flat 402, Green Glen Layout, Outer Ring Road', city: 'Bangalore', pincode: '560103', lat: 12.93, lng: 77.68 },
  ];
  for (const c of customers) {
    const existing = await prisma.user.findUnique({ where: { phone_role: { phone: c.phone, role: 'CUSTOMER' } } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        role: 'CUSTOMER',
        phone: c.phone,
        name: c.name,
        email: c.email,
        customer: {
          create: {
            referralCode: `${c.name.slice(0, 4).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`,
            city: c.city,
            walletBalance: 150,
            addresses: { create: { label: 'Home', line1: c.address, city: c.city, pincode: c.pincode, lat: c.lat, lng: c.lng, isDefault: true } },
          },
        },
      },
    });
  }

  console.log(`Done.
  Admin login    : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  Vendor login   : 9123456789 / ${DEMO_PASSWORD}   (Star Bright Laundry)
  Rider login    : 9876543210 / ${DEMO_PASSWORD}   (Rahul Yadav)
  Customer OTP   : any phone, OTP 1234 while OTP_DEV_MODE=true`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
