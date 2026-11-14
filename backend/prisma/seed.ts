/**
 * Seeds reference data (services, catalog, zones, equipment, promos, surcharges,
 * FAQs, settings) plus an admin user and a small demo fleet.
 * Idempotent: safe to run repeatedly.  `npm run db:seed`
 */
import 'dotenv/config';
import { PrismaClient, type RateUnit } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_PARTNERS = [
  {
    email: 'vastrasolutionspvtltd@gmail.com',
    name: 'Vastra Solutions',
    password: process.env.PARTNER1_PASSWORD ?? 'Yesdhobi@1575',
  },
  {
    email: 'anirudhailaboina@gmail.com',
    name: 'Anirudh',
    password: process.env.PARTNER2_PASSWORD ?? 'Anirudh@2026',
  },
  {
    email: 'kanthgade7@gmail.com',
    name: 'Kanthgade',
    password: process.env.PARTNER3_PASSWORD ?? 'Kanthgade@777',
  },
  {
    email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@yesdhobi.com').toLowerCase(),
    name: 'Yes Dhobi Admin',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
  },
];
const DEMO_PASSWORD = 'Partner@123';

// ids 1..9 match SERVICE_ID_MAP in the vendor web app
const SERVICES: { code: string; name: string; description: string; rateUnit: RateUnit; basePrice: number; leadTimeHours: number; iconName: string }[] = [
  { code: 'wash_fold', name: 'Wash & Fold', description: 'Everyday wear washed with premium detergent, tumble dried and folded crisp.', rateUnit: 'KG', basePrice: 60, leadTimeHours: 24, iconName: 'WashingMachine' },
  { code: 'wash_iron', name: 'Wash & Iron', description: 'Machine wash and dry followed by high-quality ironing.', rateUnit: 'KG', basePrice: 80, leadTimeHours: 48, iconName: 'Shirt' },
  { code: 'steam_iron', name: 'Steam Iron', description: 'Professional steam pressing for wrinkle-free crisp garments.', rateUnit: 'ITEM', basePrice: 15, leadTimeHours: 24, iconName: 'Wind' },
  { code: 'dry_iron', name: 'Dry Iron', description: 'Classic dry ironing for cottons and daily wear.', rateUnit: 'ITEM', basePrice: 10, leadTimeHours: 24, iconName: 'Wind' },
  { code: 'dry_cleaning', name: 'Dry Cleaning', description: 'Specialised solvent cleaning for delicate fabrics, suits and designer apparel.', rateUnit: 'ITEM', basePrice: 49, leadTimeHours: 72, iconName: 'Shirt' },
  { code: 'shoe_cleaning', name: 'Shoe Cleaning', description: 'Professional shoe cleaning without harming the material.', rateUnit: 'PAIR', basePrice: 249, leadTimeHours: 48, iconName: 'Footprints' },
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
  // Steam Iron Items (Client List: 22 items)
  { code: 'si_1', service: 'steam_iron', name: 'Shirt', price: 99, iconKey: 'shirt' },
  { code: 'si_2', service: 'steam_iron', name: 'Jeans', price: 99, iconKey: 'jeans' },
  { code: 'si_3', service: 'steam_iron', name: 'Trouser', price: 99, iconKey: 'jeans' },
  { code: 'si_4', service: 'steam_iron', name: 'Starch Shirt', price: 129, iconKey: 'shirt' },
  { code: 'si_5', service: 'steam_iron', name: 'Starch Pant', price: 129, iconKey: 'jeans' },
  { code: 'si_6', service: 'steam_iron', name: 'T-Shirt', price: 99, iconKey: 'tshirt' },
  { code: 'si_7', service: 'steam_iron', name: 'Kurta', price: 129, iconKey: 'shirt' },
  { code: 'si_8', service: 'steam_iron', name: 'Pyjama', price: 129, iconKey: 'jeans' },
  { code: 'si_9', service: 'steam_iron', name: 'Saree Fancy', price: 249, iconKey: 'saree' },
  { code: 'si_10', service: 'steam_iron', name: 'Saree Pattu', price: 299, iconKey: 'saree' },
  { code: 'si_11', service: 'steam_iron', name: 'Designer Saree', price: 349, iconKey: 'saree' },
  { code: 'si_12', service: 'steam_iron', name: 'Fancy Blouse', price: 49, iconKey: 'shirt' },
  { code: 'si_13', service: 'steam_iron', name: 'Pattu Blouse', price: 79, iconKey: 'shirt' },
  { code: 'si_14', service: 'steam_iron', name: 'Designer Blouse', price: 99, iconKey: 'shirt' },
  { code: 'si_15', service: 'steam_iron', name: 'Lehanga Bottom', price: 249, iconKey: 'saree' },
  { code: 'si_16', service: 'steam_iron', name: 'Lehanga with Can-Can', price: 349, iconKey: 'saree' },
  { code: 'si_17', service: 'steam_iron', name: 'Lehanga Blouse', price: 79, iconKey: 'shirt' },
  { code: 'si_18', service: 'steam_iron', name: 'Lehanga Blouse Designer', price: 129, iconKey: 'shirt' },
  { code: 'si_19', service: 'steam_iron', name: 'Anarkali', price: 249, iconKey: 'saree' },
  { code: 'si_20', service: 'steam_iron', name: 'Dupatta', price: 149, iconKey: 'saree' },
  { code: 'si_21', service: 'steam_iron', name: 'Dupatta Designer', price: 199, iconKey: 'saree' },
  { code: 'si_22', service: 'steam_iron', name: 'Chunni', price: 79, iconKey: 'saree' },
  // ==========================================
  // Dry Cleaning Items (Sub-categories: Men, Women, Kids - 55 Items)
  // ==========================================

  // --- 1. MEN - DRY CLEANING (22 Items) ---
  { code: 'dc_m_1', service: 'dry_cleaning', name: 'Waist Coat', price: 149, iconKey: 'suit' },
  { code: 'dc_m_2', service: 'dry_cleaning', name: 'Kurta Pyjama (Light)', price: 199, iconKey: 'shirt' },
  { code: 'dc_m_3', service: 'dry_cleaning', name: 'Kurta Pyjama (Heavy)', price: 349, iconKey: 'shirt' },
  { code: 'dc_m_4', service: 'dry_cleaning', name: 'Coat Short', price: 299, iconKey: 'coat' },
  { code: 'dc_m_5', service: 'dry_cleaning', name: 'Jacket Short', price: 249, iconKey: 'jacket' },
  { code: 'dc_m_6', service: 'dry_cleaning', name: 'Overcoat', price: 359, iconKey: 'coat' },
  { code: 'dc_m_7', service: 'dry_cleaning', name: 'Safari Shirt & Pant – Cotton', price: 249, iconKey: 'shirt' },
  { code: 'dc_m_8', service: 'dry_cleaning', name: 'Shirt (Half / Full)', price: 109, iconKey: 'shirt' },
  { code: 'dc_m_9', service: 'dry_cleaning', name: 'Short', price: 69, iconKey: 'jeans' },
  { code: 'dc_m_10', service: 'dry_cleaning', name: 'Socks Pair', price: 49, unit: 'pair', iconKey: 'socks' },
  { code: 'dc_m_11', service: 'dry_cleaning', name: 'Suit 2 Pc', price: 359, iconKey: 'suit' },
  { code: 'dc_m_12', service: 'dry_cleaning', name: 'Suit 3 Pc', price: 449, iconKey: 'suit' },
  { code: 'dc_m_13', service: 'dry_cleaning', name: 'Sweater / Cardigan – Full Sleeve', price: 199, iconKey: 'sweater' },
  { code: 'dc_m_14', service: 'dry_cleaning', name: 'Sweater / Cardigan – Sleeveless', price: 169, iconKey: 'sweater' },
  { code: 'dc_m_15', service: 'dry_cleaning', name: 'Shawl / Lohi', price: 199, iconKey: 'scarf' },
  { code: 'dc_m_16', service: 'dry_cleaning', name: 'Tie', price: 69, iconKey: 'shirt' },
  { code: 'dc_m_17', service: 'dry_cleaning', name: 'Pants / Trousers', price: 129, iconKey: 'pants' },
  { code: 'dc_m_18', service: 'dry_cleaning', name: 'Jeans', price: 139, iconKey: 'jeans' },
  { code: 'dc_m_19', service: 'dry_cleaning', name: 'T-Shirt', price: 109, iconKey: 'tshirt' },
  { code: 'dc_m_20', service: 'dry_cleaning', name: 'Dhoti / Lungi (Silk)', price: 119, iconKey: 'jeans' },
  { code: 'dc_m_21', service: 'dry_cleaning', name: 'Shirt & Dhoti (Silk)', price: 179, iconKey: 'shirt' },
  { code: 'dc_m_22', service: 'dry_cleaning', name: 'Undergarment', price: 49, iconKey: 'shirt' },

  // --- 2. WOMEN - DRY CLEANING (19 Items) ---
  { code: 'dc_w_1', service: 'dry_cleaning', name: 'Blouse / Top', price: 99, iconKey: 'shirt' },
  { code: 'dc_w_2', service: 'dry_cleaning', name: 'Choli + Lehanga + Dupatta', price: 699, iconKey: 'lehanga' },
  { code: 'dc_w_3', service: 'dry_cleaning', name: 'Dress (Cotton)', price: 219, iconKey: 'dress' },
  { code: 'dc_w_4', service: 'dry_cleaning', name: 'Dress (Heavy)', price: 449, iconKey: 'dress' },
  { code: 'dc_w_5', service: 'dry_cleaning', name: 'Dupatta', price: 99, iconKey: 'dupatta' },
  { code: 'dc_w_6', service: 'dry_cleaning', name: 'Kameez / Kurta', price: 119, iconKey: 'shirt' },
  { code: 'dc_w_7', service: 'dry_cleaning', name: 'Pyjama / Pants / Salwar / Churidar / Palazo Pants', price: 99, iconKey: 'pants' },
  { code: 'dc_w_8', service: 'dry_cleaning', name: 'Kurta + Pyjama / Salwar / Churidar', price: 199, iconKey: 'dress' },
  { code: 'dc_w_9', service: 'dry_cleaning', name: 'Kurta + Pyjamas / Salwar / Churidar + Dupatta', price: 299, iconKey: 'dress' },
  { code: 'dc_w_10', service: 'dry_cleaning', name: 'Lehanga / Flared Skirt', price: 359, iconKey: 'lehanga' },
  { code: 'dc_w_11', service: 'dry_cleaning', name: 'Saree (Cotton / Synthetic / Light)', price: 199, iconKey: 'saree' },
  { code: 'dc_w_12', service: 'dry_cleaning', name: 'Saree (Silk / Chiffon / Georgette / Pattu / Heavy)', price: 299, iconKey: 'saree' },
  { code: 'dc_w_13', service: 'dry_cleaning', name: 'Saree (Embroidered / Heavy)', price: 349, iconKey: 'saree' },
  { code: 'dc_w_14', service: 'dry_cleaning', name: 'Petti Coat', price: 79, iconKey: 'dress' },
  { code: 'dc_w_15', service: 'dry_cleaning', name: 'Sherwani / Achkan', price: 359, iconKey: 'suit' },
  { code: 'dc_w_16', service: 'dry_cleaning', name: 'Skirt – Pencil / Pleated / Other', price: 119, iconKey: 'dress' },
  { code: 'dc_w_17', service: 'dry_cleaning', name: 'Stocking (Pair) – Regular', price: 69, unit: 'pair', iconKey: 'socks' },
  { code: 'dc_w_18', service: 'dry_cleaning', name: 'Stole / Scarf', price: 69, iconKey: 'scarf' },
  { code: 'dc_w_19', service: 'dry_cleaning', name: 'Shorts', price: 59, iconKey: 'jeans' },

  // --- 3. KIDS - DRY CLEANING (14 Items) ---
  { code: 'dc_k_1', service: 'dry_cleaning', name: 'Blouse / Top', price: 69, iconKey: 'shirt' },
  { code: 'dc_k_2', service: 'dry_cleaning', name: 'Choli / Lehenga Dupatta', price: 399, iconKey: 'lehanga' },
  { code: 'dc_k_3', service: 'dry_cleaning', name: 'Dress (Heavy)', price: 249, iconKey: 'dress' },
  { code: 'dc_k_4', service: 'dry_cleaning', name: 'Skirt', price: 89, iconKey: 'dress' },
  { code: 'dc_k_5', service: 'dry_cleaning', name: 'Frock', price: 119, iconKey: 'frock' },
  { code: 'dc_k_6', service: 'dry_cleaning', name: 'Kurta + Pants / Salwar / Churidar + Dupatta', price: 299, iconKey: 'dress' },
  { code: 'dc_k_7', service: 'dry_cleaning', name: 'Shorts', price: 49, iconKey: 'jeans' },
  { code: 'dc_k_8', service: 'dry_cleaning', name: 'T-Shirt', price: 69, iconKey: 'tshirt' },
  { code: 'dc_k_9', service: 'dry_cleaning', name: 'Coat', price: 179, iconKey: 'coat' },
  { code: 'dc_k_10', service: 'dry_cleaning', name: 'Jacket', price: 149, iconKey: 'jacket' },
  { code: 'dc_k_11', service: 'dry_cleaning', name: '2 Pc Suit', price: 239, iconKey: 'suit' },
  { code: 'dc_k_12', service: 'dry_cleaning', name: '3 Pc Suit', price: 299, iconKey: 'suit' },
  { code: 'dc_k_13', service: 'dry_cleaning', name: 'Sweater (Full Sleeves)', price: 129, iconKey: 'sweater' },
  { code: 'dc_k_14', service: 'dry_cleaning', name: 'Sweater (Sleeveless)', price: 109, iconKey: 'sweater' },
  // Shoe Cleaning Items (Client List: Shoes)
  { code: 'sc_1', service: 'shoe_cleaning', name: 'Canvas (Cloth)', price: 349, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_2', service: 'shoe_cleaning', name: 'Leather Shoes', price: 349, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_3', service: 'shoe_cleaning', name: 'Formal Shoes', price: 349, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_4', service: 'shoe_cleaning', name: 'Sneakers', price: 449, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_5', service: 'shoe_cleaning', name: 'Boots', price: 449, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_6', service: 'shoe_cleaning', name: 'Hiking Shoes', price: 549, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_7', service: 'shoe_cleaning', name: 'Sports Shoes', price: 249, unit: 'pair', iconKey: 'shoes' },
  { code: 'sc_8', service: 'shoe_cleaning', name: 'Suede Leather Shoes', price: 349, unit: 'pair', iconKey: 'shoes' },
  // ==========================================
  // Household Items (Sub-categories: Home Items, Sofa Cleaning, Carpet Cleaning - 38 Items)
  // ==========================================

  // --- 1. HOME - HOUSEHOLD ITEMS (34 Items) ---
  { code: 'hh_h_1', service: 'households', name: 'Bath Mat', price: 49, iconKey: 'mat' },
  { code: 'hh_h_2', service: 'households', name: 'Bath Robe (Small)', price: 59, iconKey: 'shirt' },
  { code: 'hh_h_3', service: 'households', name: 'Bath Robe (Big)', price: 89, iconKey: 'shirt' },
  { code: 'hh_h_4', service: 'households', name: 'Bath Towel', price: 59, iconKey: 'towel' },
  { code: 'hh_h_5', service: 'households', name: 'Bed Cover (Single)', price: 249, iconKey: 'bedsheet' },
  { code: 'hh_h_6', service: 'households', name: 'Bed Cover (Double/King)', price: 349, iconKey: 'bedsheet' },
  { code: 'hh_h_7', service: 'households', name: 'Bed Sheet (Single)', price: 119, iconKey: 'bedsheet' },
  { code: 'hh_h_8', service: 'households', name: 'Bed Sheet (Double/King)', price: 199, iconKey: 'bedsheet' },
  { code: 'hh_h_9', service: 'households', name: 'Blanket (Single)', price: 349, iconKey: 'bedsheet' },
  { code: 'hh_h_10', service: 'households', name: 'Blanket (Double/King)', price: 449, iconKey: 'bedsheet' },
  { code: 'hh_h_11', service: 'households', name: 'Cushion Cover (Small)', price: 69, iconKey: 'bedsheet' },
  { code: 'hh_h_12', service: 'households', name: 'Cushion Cover (Medium)', price: 119, iconKey: 'bedsheet' },
  { code: 'hh_h_13', service: 'households', name: 'Pillow Cover – Cotton', price: 49, iconKey: 'bedsheet' },
  { code: 'hh_h_14', service: 'households', name: 'Pillow Cover – Embroidery', price: 99, iconKey: 'bedsheet' },
  { code: 'hh_h_15', service: 'households', name: 'Quilt (Single)', price: 449, iconKey: 'bedsheet' },
  { code: 'hh_h_16', service: 'households', name: 'Quilt (Double/King)', price: 549, iconKey: 'bedsheet' },
  { code: 'hh_h_17', service: 'households', name: 'Quilt Cover (Single)', price: 249, iconKey: 'bedsheet' },
  { code: 'hh_h_18', service: 'households', name: 'Quilt Cover (Double/King)', price: 349, iconKey: 'bedsheet' },
  { code: 'hh_h_19', service: 'households', name: 'Stuffed Toy (Small)', price: 119, iconKey: 'toy' },
  { code: 'hh_h_20', service: 'households', name: 'Stuffed Toy (Medium)', price: 199, iconKey: 'toy' },
  { code: 'hh_h_21', service: 'households', name: 'Stuffed Toy (Big)', price: 299, iconKey: 'toy' },
  { code: 'hh_h_22', service: 'households', name: 'Curtain – Without Lining (Per Panel)', price: 239, unit: 'panel', iconKey: 'curtain' },
  { code: 'hh_h_23', service: 'households', name: 'Curtain – With Lining (Per Panel)', price: 349, unit: 'panel', iconKey: 'curtain' },
  { code: 'hh_h_24', service: 'households', name: 'Face Towel', price: 39, iconKey: 'towel' },
  { code: 'hh_h_25', service: 'households', name: 'Hand Towel', price: 49, iconKey: 'towel' },
  { code: 'hh_h_26', service: 'households', name: 'Sofa Cover (Per Seat)', price: 119, unit: 'seat', iconKey: 'sofa' },
  { code: 'hh_h_27', service: 'households', name: 'Table Cloth (Small)', price: 89, iconKey: 'bedsheet' },
  { code: 'hh_h_28', service: 'households', name: 'Table Cloth (Big)', price: 149, iconKey: 'bedsheet' },
  { code: 'hh_h_29', service: 'households', name: 'Table Runner – Fancy', price: 179, iconKey: 'bedsheet' },
  { code: 'hh_h_30', service: 'households', name: 'Foot Mat (1 ft × 2 ft)', price: 59, iconKey: 'mat' },
  { code: 'hh_h_31', service: 'households', name: 'Pram', price: 399, iconKey: 'kids' },
  { code: 'hh_h_32', service: 'households', name: 'Suitcase (Small)', price: 249, iconKey: 'suitcase' },
  { code: 'hh_h_33', service: 'households', name: 'Suitcase (Medium)', price: 399, iconKey: 'suitcase' },
  { code: 'hh_h_34', service: 'households', name: 'Suitcase (Big)', price: 499, iconKey: 'suitcase' },

  // --- 2. SOFA CLEANING (3 Items) ---
  { code: 'hh_s_1', service: 'households', name: 'Cotton & Synthetic', price: 299, unit: 'seat', iconKey: 'sofa' },
  { code: 'hh_s_2', service: 'households', name: 'Silk, Velvet & Jute', price: 399, unit: 'seat', iconKey: 'sofa' },
  { code: 'hh_s_3', service: 'households', name: 'Leather', price: 499, unit: 'seat', iconKey: 'sofa' },

  // --- 3. CARPET CLEANING (1 Item) ---
  { code: 'hh_c_1', service: 'households', name: 'Carpet Cleaning', price: 30, unit: 'sq.ft', iconKey: 'carpet' },
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
      update: { name: it.name, price: it.price, unit: it.unit ?? 'pc', iconKey: it.iconKey, sortOrder: i + 1 },
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
  for (const adm of ADMIN_PARTNERS) {
    const hash = await bcrypt.hash(adm.password, 10);
    await prisma.user.upsert({
      where: { email_role: { email: adm.email.toLowerCase(), role: 'ADMIN' } },
      update: { name: adm.name, passwordHash: hash, status: 'ACTIVE' },
      create: { role: 'ADMIN', email: adm.email.toLowerCase(), name: adm.name, passwordHash: hash, status: 'ACTIVE' },
    });
  }

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
  Partner 1      : vastrasolutionspvtltd@gmail.com / Yesdhobi@1575 (Vastra Solutions)\n  Partner 2      : anirudhailaboina@gmail.com / Anirudh@2026 (Anirudh)
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
