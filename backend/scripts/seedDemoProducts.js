// backend/scripts/seedDemoProducts.js
//
// Demo catalog seeder — REVISED. ~1000 realistic products across the
// platform's 10 real categories (backend/models/Product.js's enum), owned by
// 10 demo sellers (@seed.nepshop.demo — the wipe marker), each anchored to a
// category and cross-listing ~20% of its catalog into 2-3 adjacent categories
// so common product TYPES (phones, shoes, snacks...) exist from MULTIPLE
// sellers — enabling multi-seller same-type search results. Hand-rolled
// template pools, no faker, no new dependencies.
//
// Plus ~40 hand-curated HERO products (backend/data/heroProducts.js) with
// real, model-exact image URLs (resolved+verified against Wikimedia Commons;
// keyword-image fallback where a real image couldn't be confirmed live).
//
// Corrections vs the previous (rejected ~2490-product) version:
//   • ~1000 total (~100/category), not ~2490.
//   • ONE image per product, not 2-3.
//   • Realistic NPR prices per the approved per-category ranges (see PRICE
//     notes on each type below).
//   • Automotive is PARTS/ACCESSORIES only (500-80k) — no whole cars/bikes.
//   • Real brand + model-style names ("Samsung Galaxy A55 128GB",
//     "Nike Revolution 7 Running Shoes") so names read as genuine.
//   • Image keywords all pre-tested against loremflickr (only 200-returning
//     keywords are used — see the batch-test in the seeding session notes).
//
// Images: hotlinked loremflickr URLs (tested type keyword + deterministic
// lock=N) paired with a sentinel (non-Cloudinary) publicId. Product.images
// .publicId is schema-required, but this repo has precedent for placeholder
// images with a fake publicId (backend/data/customCategoryProducts.js). The
// wipe script deletes these directly from the DB and never sends the fake
// publicId to Cloudinary. loremflickr chosen over source.unsplash.com because
// the latter returns 503 (discontinued as of 2024) — verified in-session.
//
// Embeddings: same buildProductText/embedDocument path createProduct uses,
// per product at insert time, inserted via insertMany in chunks of ~50.
//
// Idempotent: sellers matched by email; products skipped per-seller if that
// seller already owns any products (coarse, cheap).
//
// Usage:
//   cd backend
//   node scripts/seedDemoProducts.js
//
// NOTE: this repo's MongoDB is a single shared Atlas cluster used by local
// AND the deployed site — everything created here is intended to be publicly
// visible on the live site (accepted).

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const { embedDocument, buildProductText } = require('../services/embeddingService');
const HERO_PRODUCTS = require('../data/heroProducts');

const SEED_EMAIL_DOMAIN = '@seed.nepshop.demo'; // wipe marker — see wipeDemoProducts.js
const SEED_PASSWORD = 'DemoSeed1234'; // all seed sellers share this
const CHUNK_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Sellers — one anchored per real category, cross-listing into 2-3 others.
// `total` ~100 each → ~1000 total.
// ─────────────────────────────────────────────────────────────────────────────
const SELLERS = [
  { key: 'electronics', shopName: 'TechNest Electronics',       email: `technest@seed.nepshop.demo`,      anchor: 'Electronics',        cross: ['Automotive', 'Toys & Games', 'Home & Kitchen'],           total: 100 },
  { key: 'clothing',    shopName: 'Urban Thread Co.',           email: `urbanthread@seed.nepshop.demo`,   anchor: 'Clothing',           cross: ['Sports & Outdoors', 'Beauty & Health'],                   total: 100 },
  { key: 'grocery',     shopName: 'GreenBasket Grocery',        email: `greenbasket@seed.nepshop.demo`,   anchor: 'Food & Grocery',     cross: ['Home & Kitchen', 'Beauty & Health'],                      total: 100 },
  { key: 'home',        shopName: 'HearthHome Living',          email: `hearthhome@seed.nepshop.demo`,    anchor: 'Home & Kitchen',     cross: ['Electronics', 'Other', 'Food & Grocery'],                 total: 100 },
  { key: 'beauty',      shopName: 'PureGlow Beauty',            email: `pureglow@seed.nepshop.demo`,      anchor: 'Beauty & Health',    cross: ['Clothing', 'Sports & Outdoors'],                          total: 100 },
  { key: 'sports',      shopName: 'SummitGear Sports',          email: `summitgear@seed.nepshop.demo`,    anchor: 'Sports & Outdoors',  cross: ['Clothing', 'Automotive', 'Toys & Games'],                 total: 100 },
  { key: 'books',       shopName: 'InkWell Books & Stationery', email: `inkwell@seed.nepshop.demo`,       anchor: 'Books & Stationery', cross: ['Toys & Games', 'Electronics', 'Other'],                   total: 100 },
  { key: 'toys',        shopName: 'PlayNest Toys',              email: `playnest@seed.nepshop.demo`,      anchor: 'Toys & Games',       cross: ['Sports & Outdoors', 'Electronics', 'Books & Stationery'], total: 100 },
  { key: 'auto',        shopName: 'RoadReady Auto',             email: `roadready@seed.nepshop.demo`,     anchor: 'Automotive',         cross: ['Electronics', 'Sports & Outdoors', 'Other'],              total: 100 },
  { key: 'other',       shopName: 'Everyday Finds',             email: `everydayfinds@seed.nepshop.demo`, anchor: 'Other',              cross: ['Home & Kitchen', 'Beauty & Health', 'Books & Stationery'], total: 100 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Description flavor pools (category-specific concrete attributes).
// ─────────────────────────────────────────────────────────────────────────────
const ATTR_SENTENCES = {
  'Electronics':        ['Comes with a manufacturer warranty and original accessories in the box.', 'Energy-efficient with fast-charging support and a durable finish.', 'Compact, reliable build tested for everyday performance.'],
  'Clothing':           ['Made from breathable, easy-care fabric that holds its shape after washing.', 'Available in multiple sizes with a comfortable everyday fit.', 'Stitched for durability with reinforced seams.'],
  'Food & Grocery':     ['Sourced fresh and packed to preserve flavor and quality.', 'No artificial preservatives, suitable for daily household use.', 'Sealed for freshness with a clearly printed expiry date.'],
  'Home & Kitchen':     ['Built from sturdy, easy-to-clean materials for daily household use.', 'Space-saving design that fits easily into any Nepali kitchen or living room.', 'Backed by a standard replacement warranty.'],
  'Beauty & Health':    ['Dermatologically mild formula suitable for regular use.', 'Free from harsh chemicals, suitable for most skin and hair types.', 'Compact packaging, easy to carry for daily or travel use.'],
  'Sports & Outdoors':  ['Built for durability under regular training and outdoor use.', 'Lightweight construction designed for comfort during extended sessions.', 'Meets standard specifications for club and casual play.'],
  'Books & Stationery': ['Printed on quality paper suitable for daily school, college, or office use.', 'Compact and durable, built to withstand daily use in a bag.', 'A practical addition to any student or professional desk setup.'],
  'Toys & Games':       ['Made from child-safe materials, tested for durability.', 'Encourages hands-on play and helps build motor and thinking skills.', 'Compact packaging makes it an easy gift for birthdays and festivals.'],
  'Automotive':         ['Compatible with most standard models available in the Nepali market.', 'Built for durability under regular road and weather conditions.', 'Easy to install with standard tools, no special fittings required.'],
  'Other':              ['A practical, everyday item built for reliable regular use.', 'Compact and easy to store, suitable for home or travel use.', 'Designed for convenience with everyday households in mind.'],
};
const CLOSER_SENTENCES = [
  'Ships quickly with reliable delivery across Nepal.',
  'A popular pick among regular customers.',
  'Great value for the price, backed by responsive seller support.',
  'Carefully checked for quality before dispatch.',
];

// ─────────────────────────────────────────────────────────────────────────────
// Type pools. Each type: { noun (searchable common term), keyword (TESTED
// loremflickr tag), price:[minNPR,maxNPR], lead (brand OR full brand+model
// strings), variants }. Name = `${pick(lead)} ${pick(variants)}`; the noun
// goes into the description so the generic search term ("phone","shoes") is
// always present in text + embedding.
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_POOLS = {
  'Electronics': [
    { noun: 'smartphone', keyword: 'smartphone', price: [15000, 180000], lead: ['Samsung Galaxy A55','Samsung Galaxy S24','Samsung Galaxy M35','Apple iPhone 15','Apple iPhone 14','Apple iPhone 13','Xiaomi Redmi Note 13','Xiaomi Redmi 13C','OnePlus Nord CE 4','OnePlus 12R','Realme C67','Realme 12 Pro','Vivo Y28','Vivo V30','Oppo A79','Oppo Reno 11','Nokia G42','Nothing Phone 2a'], variants: ['128GB','256GB 5G','8GB/128GB','12GB/256GB','64GB'] },
    { noun: 'laptop', keyword: 'laptop', price: [40000, 250000], lead: ['Dell Inspiron 15','Dell XPS 13','HP Pavilion 14','HP Victus 15','Lenovo IdeaPad Slim 3','Lenovo Legion 5','Asus VivoBook 15','Asus TUF Gaming F15','Acer Aspire 5','Acer Nitro 5','Apple MacBook Air M2','Apple MacBook Pro 14','MSI Modern 14'], variants: ['i5 8GB 512GB','i7 16GB 1TB','Ryzen 5 16GB','i3 8GB 256GB','Gaming RTX 16GB'] },
    { noun: 'headphones', keyword: 'headphones', price: [1000, 25000], lead: ['Sony WH-1000XM5','Sony WF-C500','boAt Rockerz 450','boAt Airdopes 141','JBL Tune 510BT','JBL Live 660NC','Sennheiser HD 450BT','Skullcandy Dime 3','Apple AirPods Pro','Samsung Galaxy Buds 2','Marshall Major IV'], variants: ['Wireless','ANC Over-Ear','True Wireless Earbuds','Bluetooth Headset','Sport Earbuds'] },
    { noun: 'television', keyword: 'television', price: [22000, 180000], lead: ['Samsung Crystal 4K','LG UHD Smart TV','Sony Bravia X75L','TCL C645 QLED','Xiaomi Mi TV 5X','Hisense A6K'], variants: ['43-inch','55-inch 4K','32-inch HD','65-inch QLED','50-inch Android TV'] },
    { noun: 'camera', keyword: 'camera', price: [8000, 200000], lead: ['Canon EOS R50','Canon EOS 1500D','Nikon Z30','Nikon D3500','Sony Alpha ZV-E10','GoPro HERO12','DJI Osmo Action 4','Fujifilm Instax Mini 12'], variants: ['Mirrorless Kit','DSLR 18-55mm','Action Cam 4K','Vlogging Camera','Instant Camera'] },
    { noun: 'smartwatch', keyword: 'smartwatch', price: [2500, 25000], lead: ['Apple Watch SE','Samsung Galaxy Watch 6','Amazfit GTR 4','Noise ColorFit Pro 4','boAt Wave Call','Garmin Forerunner 55','Fire-Boltt Ninja'], variants: ['GPS 45mm','AMOLED Display','Bluetooth Calling','Fitness Tracker','Sport Edition'] },
    { noun: 'tablet', keyword: 'tablet', price: [15000, 120000], lead: ['Samsung Galaxy Tab S9','Samsung Galaxy Tab A9','Apple iPad 10th Gen','Apple iPad Air','Lenovo Tab M11','Xiaomi Pad 6','Huawei MatePad 11'], variants: ['WiFi 64GB','128GB 5G','11-inch','8-inch','Kids Edition'] },
    { noun: 'bluetooth speaker', keyword: 'speaker', price: [1500, 25000], lead: ['JBL Flip 6','JBL Charge 5','Sony SRS-XB13','Bose SoundLink Flex','Marshall Emberton II','boAt Stone 1200','Anker Soundcore 2'], variants: ['Portable Bluetooth','Waterproof','Party Speaker','Mini Speaker','Soundbar'] },
    { noun: 'power bank', keyword: 'powerbank', price: [500, 8000], lead: ['Anker PowerCore','Mi Power Bank 3i','Samsung 25W','Belkin BoostCharge','Ambrane Stylo'], variants: ['10000mAh','20000mAh','Fast Charging 65W','Slim 10000mAh','Wireless'] },
    { noun: 'gaming accessory', keyword: 'keyboard', price: [1000, 15000], lead: ['Sony DualSense','Logitech G304','Razer Kraken','Redgear Pro','Cosmic Byte'], variants: ['Wireless Controller','Gaming Mouse','Mechanical Keyboard','Gaming Headset','RGB Combo'] },
  ],
  'Clothing': [
    { noun: 't-shirt', keyword: 'tshirt', price: [500, 3500], lead: ['Nike','Adidas','Puma','H&M','Levi\'s','US Polo'], variants: ['Cotton Crew Neck T-Shirt','Graphic Print T-Shirt','Polo T-Shirt','V-Neck T-Shirt','Oversized T-Shirt'] },
    { noun: 'jeans', keyword: 'jeans', price: [1200, 6500], lead: ['Levi\'s','Wrangler','Lee','Spykar','Pepe'], variants: ['501 Slim Fit Jeans','Regular Fit Jeans','Skinny Jeans','Bootcut Jeans','Cargo Jeans'] },
    { noun: 'shirt', keyword: 'shirt', price: [700, 4500], lead: ['Van Heusen','Peter England','Raymond','Allen Solly','Arrow'], variants: ['Formal Cotton Shirt','Checked Casual Shirt','Linen Shirt','Denim Shirt','Flannel Shirt'] },
    { noun: 'dress', keyword: 'dress', price: [1200, 8000], lead: ['Zara','H&M','Forever 21','Vero Moda','ONLY'], variants: ['Summer Floral Dress','Maxi Dress','Bodycon Dress','A-Line Dress','Party Wear Dress'] },
    { noun: 'jacket', keyword: 'jacket', price: [2000, 8000], lead: ['The North Face','Nike','Adidas','Wrangler','Woodland'], variants: ['Denim Jacket','Bomber Jacket','Windcheater','Puffer Jacket','Hooded Jacket'] },
    { noun: 'sneakers', keyword: 'shoes', price: [1500, 8000], lead: ['Nike Revolution 7','Nike Air Max SC','Adidas Runfalcon 3','Adidas Grand Court','Puma Softride','Puma Flyer Runner','Reebok Energen','Bata Power','Woodland'], variants: ['Running Shoes','Sports Shoes','Casual Sneakers','Canvas Shoes','Walking Shoes'] },
    { noun: 'traditional wear', keyword: 'fashion', price: [1500, 8000], lead: ['Fabindia','Manyavar','Biba','W for Woman','Global Desi'], variants: ['Kurta Set','Daura Suruwal','Cotton Kurti','Sherwani','Ethnic Wear'] },
    { noun: 'innerwear and socks', keyword: 'socks', price: [500, 2500], lead: ['Jockey','Van Heusen','Puma','Rupa'], variants: ['Cotton Briefs Pack','Crew Socks Pack of 3','Ankle Socks Pack','Thermal Set','Vest Pack'] },
    { noun: 'winter wear', keyword: 'sweater', price: [1200, 7500], lead: ['Woodland','Monte Carlo','Uniqlo','Duke'], variants: ['Wool Sweater','Fleece Hoodie','Cardigan','Pullover','Turtleneck'] },
    { noun: 'bag and accessories', keyword: 'handbag', price: [500, 4500], lead: ['Wildcraft','Puma','Baggit','Fastrack','Caprese'], variants: ['Tote Bag','Sling Bag','Handbag','Backpack','Wallet'] },
  ],
  'Food & Grocery': [
    { noun: 'chips and snacks', keyword: 'chips', price: [50, 250], lead: ['Lays','Kurkure','Bingo','Pringles','Haldiram\'s'], variants: ['Classic Salted','Masala Magic','Spicy Chilli','Cream & Onion','Tomato'] },
    { noun: 'instant noodles', keyword: 'noodles', price: [50, 180], lead: ['Wai Wai','Maggi','Rara','Mayos','2PM'], variants: ['Chicken Noodles 5-Pack','Vegetable Noodles','Masala Noodles','Curry Noodles','Family Pack'] },
    { noun: 'beverage and juice', keyword: 'juice', price: [50, 300], lead: ['Coca-Cola','Pepsi','Real','Frooti','Sprite'], variants: ['500ml Bottle','1L Juice','Can 330ml','Mango Juice 1L','2L Family Pack'] },
    { noun: 'cooking essentials', keyword: 'rice', price: [150, 2000], lead: ['Fortune','Saffola','Tata','Aashirvaad','Everest'], variants: ['Refined Oil 1L','Basmati Rice 5kg','Wheat Flour 5kg','Spice Mix 200g','Pure Ghee 500ml'] },
    { noun: 'dairy product', keyword: 'milk', price: [60, 650], lead: ['Amul','DDC','Nestle','Sujal'], variants: ['Milk 1L','Cheese Slices','Butter 500g','Curd 400g','Paneer 200g'] },
    { noun: 'fresh produce', keyword: 'vegetables', price: [50, 650], lead: ['Farm Fresh','GreenBasket','Local Harvest'], variants: ['Apple 1kg','Banana Dozen','Tomato 1kg','Potato 5kg','Mixed Vegetables Pack'] },
    { noun: 'bakery item', keyword: 'bread', price: [50, 650], lead: ['Britannia','Parle','Nimto','Daily Fresh'], variants: ['Bread Loaf','Butter Cookies','Cake Slice','Rusk Pack','Croissant Pack'] },
    { noun: 'meat and seafood', keyword: 'chicken', price: [200, 2000], lead: ['Local Farm','FreshCut','GreenBasket'], variants: ['Chicken 1kg','Mutton 1kg','Fish Fillet 500g','Eggs Dozen','Prawns 500g'] },
    { noun: 'tea and coffee', keyword: 'tea', price: [120, 1500], lead: ['Nescafe','Tokla','Bru','Ilam Tea','Tetley'], variants: ['Green Tea 25 Bags','Black Tea 250g','Instant Coffee Jar','Ground Coffee 200g','Herbal Tea'] },
    { noun: 'confectionery and sweets', keyword: 'chocolate', price: [80, 1500], lead: ['Cadbury','Nestle','Haldiram\'s','Ferrero'], variants: ['Dairy Milk Chocolate','Gift Box','Traditional Mithai 500g','Assorted Candy','KitKat Pack'] },
  ],
  'Home & Kitchen': [
    { noun: 'cookware', keyword: 'cookware', price: [600, 6500], lead: ['Prestige','Hawkins','Pigeon','Wonderchef','Milton'], variants: ['Non-Stick Pan','Pressure Cooker 5L','Kadai','Tawa','Cookware Set'] },
    { noun: 'furniture', keyword: 'furniture', price: [1800, 25000], lead: ['Nilkamal','Godrej Interio','Durian','WoodCraft'], variants: ['Study Table','Bookshelf','Bedside Table','Office Chair','Coffee Table'] },
    { noun: 'bedding', keyword: 'bedsheet', price: [900, 6500], lead: ['Bombay Dyeing','Spaces','Raymond Home','D\'Decor'], variants: ['Cotton Bedsheet Set','Comforter','Pillow Pair','Fleece Blanket','Mattress Protector'] },
    { noun: 'kitchen appliance', keyword: 'blender', price: [1500, 20000], lead: ['Prestige','Philips','Bajaj','Havells','Morphy Richards'], variants: ['Mixer Grinder','Electric Kettle','Air Fryer','Induction Cooktop','Rice Cooker'] },
    { noun: 'storage and organization', keyword: 'basket', price: [500, 4500], lead: ['Milton','Cello','Wonderchef'], variants: ['Storage Container Set','Shoe Rack','Wardrobe Organizer','Storage Basket','Spice Rack'] },
    { noun: 'home decor', keyword: 'clock', price: [500, 5500], lead: ['@home','HomeStyle','ArtDecor'], variants: ['Wall Clock','Table Lamp','Photo Frame Set','Wall Art Canvas','Decorative Vase'] },
    { noun: 'cleaning supplies', keyword: 'broom', price: [500, 2500], lead: ['Scotch-Brite','Gala','Harpic','Lizol'], variants: ['Spin Mop Set','Cleaning Kit','Dishwash Liquid 1L','Floor Cleaner 2L','Broom & Wiper Set'] },
    { noun: 'bathroom essentials', keyword: 'towel', price: [500, 3500], lead: ['Cera','Trident','Story@Home'], variants: ['Shower Curtain','Bath Mat Set','Cotton Towel Set','Bathroom Organizer','Soap Dispenser'] },
    { noun: 'lighting', keyword: 'lamp', price: [500, 3800], lead: ['Philips','Havells','Syska','Wipro'], variants: ['LED Bulb Pack of 4','Ceiling Light','Study Table Lamp','Fairy String Lights','Emergency Light'] },
    { noun: 'garden and outdoor', keyword: 'plant', price: [500, 4500], lead: ['GreenThumb','Local Nursery','Ugaau'], variants: ['Plant Pot Set','Garden Tool Kit','Artificial Plant','Watering Can','Outdoor Chair'] },
  ],
  'Beauty & Health': [
    { noun: 'skincare', keyword: 'skincare', price: [200, 3500], lead: ['Nivea','Pond\'s','Lakme','Himalaya','Neutrogena','The Body Shop'], variants: ['Face Wash','Moisturizer Cream','Sunscreen SPF50','Face Serum','Night Cream'] },
    { noun: 'shampoo and haircare', keyword: 'shampoo', price: [200, 2200], lead: ['Pantene','Dove','L\'Oreal Paris','Himalaya','Head & Shoulders'], variants: ['Shampoo 340ml','Conditioner 180ml','Hair Oil 200ml','Hair Serum','Anti-Dandruff Shampoo'] },
    { noun: 'makeup', keyword: 'lipstick', price: [200, 3200], lead: ['Lakme','Maybelline','MAC','Essence','Revlon'], variants: ['Matte Lipstick','Foundation','Mascara','Eyeshadow Palette','Compact Powder'] },
    { noun: 'perfume and fragrance', keyword: 'perfume', price: [250, 5000], lead: ['Fogg','Calvin Klein','Denver','Wild Stone','Engage'], variants: ['Eau de Parfum 100ml','Body Spray 150ml','Deodorant','Perfume Gift Set','Pocket Perfume'] },
    { noun: 'health supplement', keyword: 'vitamins', price: [450, 5000], lead: ['HealthKart','Himalaya','GNC','Nature\'s Bounty'], variants: ['Multivitamin Tablets','Whey Protein 1kg','Fish Oil Capsules','Immunity Booster','Biotin Tablets'] },
    { noun: 'personal care', keyword: 'shaving', price: [200, 4500], lead: ['Gillette','Philips','Oral-B','Colgate'], variants: ['Electric Shaver','Beard Trimmer','Electric Toothbrush','Shaving Kit','Body Wash'] },
    { noun: 'wellness device', keyword: 'thermometer', price: [500, 5000], lead: ['Omron','Dr. Trust','Beurer','AccuSure'], variants: ['Digital BP Monitor','Digital Thermometer','Nebulizer','Weighing Scale','Pulse Oximeter'] },
    { noun: 'baby care', keyword: 'lotion', price: [200, 2200], lead: ['Johnson\'s','Himalaya','Mamaearth','Sebamed'], variants: ['Baby Lotion','Baby Shampoo','Baby Powder','Diaper Rash Cream','Baby Wipes Pack'] },
    { noun: 'nail care', keyword: 'nailpolish', price: [200, 1500], lead: ['Lakme','Maybelline','Essence','Colorbar'], variants: ['Nail Polish Set','Nail Care Kit','Gel Polish','Cuticle Oil','Nail File Set'] },
    { noun: 'men grooming', keyword: 'beard', price: [200, 2500], lead: ['Beardo','Ustraa','Nivea Men','Old Spice'], variants: ['Beard Oil','Beard Wash','Aftershave Lotion','Face Wash for Men','Hair Wax'] },
  ],
  'Sports & Outdoors': [
    { noun: 'cricket gear', keyword: 'cricket', price: [500, 8500], lead: ['SG','SS','MRF','Kookaburra'], variants: ['Cricket Bat','Cricket Ball Leather','Batting Gloves','Cricket Helmet','Wicket Keeping Pads'] },
    { noun: 'football gear', keyword: 'football', price: [500, 4500], lead: ['Nike','Adidas','Puma','Nivia'], variants: ['Match Football Size 5','Training Cones Set','Shin Guards','Goalkeeper Gloves','Football Jersey'] },
    { noun: 'fitness equipment', keyword: 'dumbbell', price: [500, 6500], lead: ['Cosco','Reebok','Kobo','Aurion'], variants: ['Yoga Mat','Dumbbell Set 10kg','Resistance Bands','Skipping Rope','Foam Roller'] },
    { noun: 'cycling gear', keyword: 'bicycle', price: [500, 40000], lead: ['Hero','Firefox','Giant','Btwin'], variants: ['Mountain Bike','Cycling Helmet','Bike Lock','LED Bike Light Set','Cycling Gloves'] },
    { noun: 'camping gear', keyword: 'tent', price: [900, 12000], lead: ['Wildcraft','Quechua','Coleman'], variants: ['Camping Tent 2-Person','Sleeping Bag','Trekking Backpack 50L','Hiking Poles','Portable Stove'] },
    { noun: 'racket sport', keyword: 'badminton', price: [500, 6500], lead: ['Yonex','Li-Ning','Cosco'], variants: ['Badminton Racket','Table Tennis Paddle','Tennis Racket','Shuttlecock Pack','TT Ball Set'] },
    { noun: 'swimming gear', keyword: 'swimming', price: [500, 3500], lead: ['Speedo','Nivia','Arena'], variants: ['Swimming Goggles','Swim Cap','Swimming Costume','Pool Float','Swim Fins'] },
    { noun: 'team sports equipment', keyword: 'basketball', price: [500, 4500], lead: ['Cosco','Nivia','Spalding'], variants: ['Basketball Size 7','Volleyball','Badminton Net','Sports Whistle','Team Jersey Set'] },
    { noun: 'protective gear', keyword: 'safety', price: [500, 3500], lead: ['SG','Nivia','Cosco'], variants: ['Sports Helmet','Knee Pads','Elbow Guards','Wrist Guards','Mouth Guard'] },
    { noun: 'trekking gear', keyword: 'boots', price: [500, 6500], lead: ['Wildcraft','Quechua','Woodland'], variants: ['Trekking Boots','Rain Poncho','Headlamp','Multi-Tool Knife','Compass'] },
  ],
  'Books & Stationery': [
    { noun: 'notebook', keyword: 'notebook', price: [100, 650], lead: ['Classmate','Navneet','Oxford','Camlin'], variants: ['Long Notebook 200pg','Spiral Notebook','Ruled Diary','Graph Notebook','Sketchbook'] },
    { noun: 'pen and writing', keyword: 'pen', price: [100, 1800], lead: ['Cello','Parker','Reynolds','Pilot'], variants: ['Ball Pen Pack of 10','Gel Pen Set','Fountain Pen','Mechanical Pencil','Highlighter Set of 6'] },
    { noun: 'office supplies', keyword: 'stapler', price: [100, 900], lead: ['Kangaro','Deli','Camlin'], variants: ['Stapler with Pins','Sticky Notes Set','Paper Clips Box','Scissors','Tape Dispenser'] },
    { noun: 'paper product', keyword: 'paper', price: [120, 900], lead: ['JK Paper','Classmate','Navneet'], variants: ['A4 Copy Paper 500 Sheets','Chart Paper Pack','Craft Paper','Sticky Labels','Graph Paper Pad'] },
    { noun: 'fiction book', keyword: 'book', price: [250, 1800], lead: ['Penguin','HarperCollins','Vintage'], variants: ['Bestseller Novel','Short Story Collection','Mystery Thriller','Fantasy Series','Classic Literature'] },
    { noun: 'educational book', keyword: 'textbook', price: [300, 2500], lead: ['Oxford','Cambridge','Local Publisher'], variants: ['Reference Guide','Exam Prep Book','English Dictionary','Encyclopedia','Grammar Workbook'] },
    { noun: 'art supplies', keyword: 'crayons', price: [150, 2200], lead: ['Camlin','Faber-Castell','Staedtler'], variants: ['Watercolor Set','Crayon Box 24','Sketch Pencil Set','Poster Colors','Drawing Kit'] },
    { noun: 'desk accessory', keyword: 'desk', price: [200, 1800], lead: ['Kangaro','Deli','Solo'], variants: ['Desk Organizer Stand','Pen Stand','Bookend Pair','Small Whiteboard','Desk Calendar'] },
    { noun: 'filing and storage', keyword: 'folder', price: [100, 900], lead: ['Solo','Kangaro','Deli'], variants: ['File Folder Pack','Document Box','Expanding File','Ring Binder','Clip Board'] },
    { noun: 'greeting and gifting', keyword: 'card', price: [100, 650], lead: ['Archies','Hallmark'], variants: ['Greeting Card Pack','Gift Wrap Paper','Ribbon Set','Gift Tags','Birthday Card'] },
  ],
  'Toys & Games': [
    { noun: 'building blocks toy', keyword: 'blocks', price: [500, 6500], lead: ['LEGO','Mega Bloks','Funskool'], variants: ['Building Blocks Set','City Construction Kit','Classic Bricks Box','Robot Building Kit','Architecture Set'] },
    { noun: 'doll and action figure', keyword: 'doll', price: [500, 4500], lead: ['Barbie','Hot Wheels','Funskool'], variants: ['Fashion Doll Set','Action Figure','Superhero Figure','Doll House','Character Playset'] },
    { noun: 'board game', keyword: 'chess', price: [500, 3500], lead: ['Funskool','Cardinal','Local Brand'], variants: ['Wooden Chess Set','Ludo & Snakes Board','Monopoly','500-Piece Puzzle','Scrabble'] },
    { noun: 'rc and electronic toy', keyword: 'robot', price: [800, 8500], lead: ['Hot Wheels','RC World','Silverlit'], variants: ['Remote Control Car','RC Mini Drone','Interactive Robot Toy','RC Helicopter','Learning Tablet'] },
    { noun: 'outdoor play toy', keyword: 'kite', price: [500, 8500], lead: ['PlaySafe','Cosco','Local Brand'], variants: ['Kids Badminton Set','Bubble Gun','Water Gun','Kite Combo','Mini Trampoline'] },
    { noun: 'educational toy', keyword: 'puzzle', price: [500, 4500], lead: ['Fisher-Price','Funskool','Skillmatics'], variants: ['Learning Alphabet Set','Math Puzzle Kit','Science Experiment Kit','Coding Robot Kit','Flash Cards Set'] },
    { noun: 'soft toy', keyword: 'teddy', price: [500, 3500], lead: ['Dimpy Stuff','PlushWorld','Archies'], variants: ['Teddy Bear Large','Stuffed Animal','Plush Pillow','Character Plush','Baby Soft Toy'] },
    { noun: 'pretend play toy', keyword: 'toykitchen', price: [500, 4500], lead: ['PlaySafe','Funskool','Little Tikes'], variants: ['Kitchen Play Set','Doctor Play Set','Tool Set Toy','Cash Register Toy','Dress-Up Costume'] },
    { noun: 'card and party game', keyword: 'playingcards', price: [500, 1800], lead: ['Mattel','Funskool','Local Brand'], variants: ['UNO Card Game','Party Game Set','Trivia Game','Playing Cards Deck','Bingo Set'] },
    { noun: 'kids sports toy', keyword: 'toyball', price: [500, 3500], lead: ['Cosco','PlaySafe','Nivia'], variants: ['Kids Basketball Hoop','Frisbee','Kids Football Set','Skipping Rope Kids','Beach Ball Set'] },
  ],
  // Automotive — PARTS / ACCESSORIES / GEAR ONLY. No whole cars or bikes.
  // All ranges within 500-80000 NPR.
  'Automotive': [
    { noun: 'tires and wheels', keyword: 'tire', price: [1200, 30000], lead: ['MRF','CEAT','Michelin','Bridgestone'], variants: ['Motorcycle Tire','Car Tyre','Alloy Wheel','Tyre Tube','Wheel Cover Set'] },
    { noun: 'car interior accessory', keyword: 'carinterior', price: [500, 15000], lead: ['3M','Bosch','Elegant'], variants: ['Car Floor Mats Set','Seat Covers','Steering Cover','Car Organizer','Sunshade Set'] },
    { noun: 'vehicle electronics', keyword: 'carstereo', price: [1500, 40000], lead: ['Pioneer','Sony','JBL','Bosch'], variants: ['Car Stereo System','Reverse Camera','Dash Cam','GPS Navigator','Car Speaker Set'] },
    { noun: 'vehicle maintenance', keyword: 'engineoil', price: [500, 6000], lead: ['Castrol','Shell','Mobil','3M'], variants: ['Engine Oil 1L','Chain Lubricant','Car Wax Polish','Coolant 1L','Brake Fluid'] },
    { noun: 'riding gear and helmet', keyword: 'biker', price: [800, 15000], lead: ['Studds','Vega','Steelbird','Axor'], variants: ['Full-Face Helmet','Riding Gloves','Riding Jacket','Knee Guards','Rain Suit'] },
    { noun: 'vehicle battery and electrical', keyword: 'battery', price: [800, 25000], lead: ['Exide','Amaron','Bosch'], variants: ['Car Battery','Bike Battery','LED Headlight Kit','Horn Set','Indicator Set'] },
    { noun: 'spare parts', keyword: 'sparkplug', price: [500, 12000], lead: ['Bosch','Bajaj Genuine','Hero Genuine'], variants: ['Brake Pads Set','Air Filter','Clutch Plate Set','Spark Plug','Chain Sprocket Kit'] },
    { noun: 'tools and equipment', keyword: 'tools', price: [800, 20000], lead: ['Bosch','Stanley','Taparia'], variants: ['Car Tool Kit','Hydraulic Jack','Jumper Cable Set','Tyre Inflator','Air Compressor'] },
    { noun: 'car cleaning and detailing', keyword: 'carinterior', price: [500, 6000], lead: ['3M','Meguiar\'s','Turtle Wax'], variants: ['Microfiber Cloth Set','Car Shampoo','Interior Cleaner','Tyre Shine','Dashboard Polish'] },
    { noun: 'mirrors and fittings', keyword: 'mirror', price: [500, 8000], lead: ['Pilot','Elegant','Autofit'], variants: ['Side Mirror Set','Number Plate','Mud Flaps','Bike Crash Guard','Mobile Holder Mount'] },
  ],
  'Other': [
    { noun: 'travel luggage', keyword: 'luggage', price: [900, 8500], lead: ['American Tourister','Safari','Wildcraft','VIP'], variants: ['Trolley Bag','Travel Backpack 25L','Duffel Bag','Travel Neck Pillow','Toiletry Kit'] },
    { noun: 'rain gear and umbrella', keyword: 'umbrella', price: [250, 2200], lead: ['Fendo','Cobra','Local Brand'], variants: ['Windproof Foldable Umbrella','Raincoat','Rain Poncho','Golf Umbrella','Kids Umbrella'] },
    { noun: 'storage solution', keyword: 'container', price: [300, 3500], lead: ['Milton','Cello','Aristo'], variants: ['Plastic Storage Box','Laundry Basket','Under-Bed Storage','Vacuum Storage Bags','Multipurpose Container'] },
    { noun: 'household item', keyword: 'flashlight', price: [250, 3500], lead: ['Eveready','Syska','Local Brand'], variants: ['LED Flashlight','Study Lamp','Wall Clock','Doormat','Sewing Repair Kit'] },
    { noun: 'pet supplies', keyword: 'petfood', price: [300, 4500], lead: ['Pedigree','Whiskas','Drools'], variants: ['Dog Food 3kg','Cat Food 1.2kg','Pet Bed','Pet Leash','Pet Grooming Kit'] },
    { noun: 'gift item', keyword: 'gift', price: [400, 4500], lead: ['Archies','FNP','Local Craft'], variants: ['Gift Hamper','Photo Frame Set','Scented Candle Set','Gift Box Assorted','Personalized Mug'] },
    { noun: 'seasonal decoration', keyword: 'candle', price: [250, 3500], lead: ['Local Brand','FestiveHome'], variants: ['Festival Decoration Set','Diya & Candle Set','Party Supplies Kit','String Lights','Celebration Banner'] },
    { noun: 'electronics accessory', keyword: 'cable', price: [200, 1800], lead: ['Ambrane','boAt','Portronics'], variants: ['USB-C Cable','Universal Remote','Extension Cord','Multi-Plug Adapter','Phone Holder'] },
    { noun: 'magazine and media', keyword: 'magazine', price: [200, 900], lead: ['Local Publisher','Media House'], variants: ['Puzzle Book','Coloring Book','Magazine Subscription','Wall Calendar','Comic Bundle'] },
    { noun: 'everyday essential', keyword: 'toolkit', price: [200, 2500], lead: ['Stanley','Taparia','Local Brand'], variants: ['Multipurpose Tool Kit','Batteries Pack of 8','Sewing Kit','Cleaning Cloth Set','Torch & Battery Combo'] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (no dependencies)
// ─────────────────────────────────────────────────────────────────────────────
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const buildDescription = (category, name, noun) => {
  const parts = [`The ${name} is a quality ${noun} offering reliable everyday value.`, pick(ATTR_SENTENCES[category] || ATTR_SENTENCES['Other'])];
  if (Math.random() < 0.6) parts.push(pick(CLOSER_SENTENCES));
  return parts.join(' ');
};

let globalImageIndex = 0;
const buildOneImage = (keyword, categorySlug) => {
  globalImageIndex++;
  return [{
    url: `https://loremflickr.com/400/400/${keyword}?lock=${globalImageIndex}`,
    publicId: `seed-demo-${categorySlug}-${globalImageIndex}`,
  }];
};

// Round-robin lead x variant cycler for broad coverage without heavy RNG.
const makeCycler = (typeSpec) => {
  let li = 0, vi = 0;
  return () => {
    const lead = typeSpec.lead[li % typeSpec.lead.length];
    const variant = typeSpec.variants[vi % typeSpec.variants.length];
    li++;
    if (li % typeSpec.lead.length === 0) vi++;
    return { lead, variant };
  };
};

const buildProductsForCategory = (category, count, sellerId) => {
  const pool = TYPE_POOLS[category];
  const categorySlug = slugify(category);
  const products = [];
  const cyclers = pool.map(makeCycler);

  for (let i = 0; i < count; i++) {
    const typeIdx = i % pool.length;
    const typeSpec = pool[typeIdx];
    const { lead, variant } = cyclers[typeIdx]();

    const price = randInt(typeSpec.price[0], typeSpec.price[1]);
    let comparePrice = null;
    let discount = 0;
    if (Math.random() < 0.35) {
      discount = randInt(5, 40);
      comparePrice = Math.round(price / (1 - discount / 100));
    }

    const hasReviews = Math.random() > 0.28;
    const rating = hasReviews ? +(randInt(30, 50) / 10).toFixed(1) : 0;
    const numReviews = hasReviews ? randInt(1, 500) : 0;

    const name = `${lead} ${variant}`.slice(0, 200);
    const description = buildDescription(category, name, typeSpec.noun);

    products.push({
      name,
      description,
      price,
      comparePrice,
      images: buildOneImage(typeSpec.keyword, categorySlug),
      category,
      stock: randInt(5, 50),
      seller: sellerId,
      isActive: true,
      deactivatedBySystem: false,
      isFeatured: Math.random() < 0.03,
      rating,
      numReviews,
      discount,
    });
  }
  return products;
};

// ─────────────────────────────────────────────────────────────────────────────
// Seller upsert (idempotent by email) — mirrors a real verified seller's shape
// (roles[], activeRole, status:'active', isEmailVerified, approvedAt).
// ─────────────────────────────────────────────────────────────────────────────
const ensureSeller = async (spec, index) => {
  const existing = await User.findOne({ email: spec.email });
  if (existing) {
    console.log(`  [seller] "${spec.shopName}" already exists (${spec.email}) — reusing`);
    return existing;
  }
  const user = await User.create({
    firstName: spec.shopName.split(' ')[0],
    lastName: 'Store',
    email: spec.email,
    phone: `98${String(10000000 + index).padStart(8, '0')}`,
    password: SEED_PASSWORD,
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: spec.shopName,
    panNumber: `SEED-PAN-${String(index).padStart(4, '0')}`,
    shopAddress: { street: 'Demo Street', city: 'Kathmandu', district: 'Kathmandu', phone: `98${String(10000000 + index).padStart(8, '0')}` },
    isEmailVerified: true,
    approvedAt: new Date(),
  });
  console.log(`  [seller] created "${spec.shopName}" (${spec.email})`);
  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const tStart = Date.now();
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to DB.\n');
  console.log(`Demo seller password (all): ${SEED_PASSWORD}\n`);

  // ── 1. Sellers ──────────────────────────────────────────────────────────
  console.log('── Sellers ──────────────────────────────────────');
  const sellerDocs = {};
  for (let i = 0; i < SELLERS.length; i++) {
    sellerDocs[SELLERS[i].key] = await ensureSeller(SELLERS[i], i);
  }
  const allSellerIds = Object.values(sellerDocs).map((u) => u._id);

  // ── 2. Bulk products (skip sellers that already have products) ───────────
  console.log('\n── Products ─────────────────────────────────────');
  const perSellerCounts = {};
  const perCategoryCounts = {};
  let toInsert = [];
  const skipped = [];

  for (const spec of SELLERS) {
    const sellerId = sellerDocs[spec.key]._id;
    const existingCount = await Product.countDocuments({ seller: sellerId });
    if (existingCount > 0) {
      console.log(`  [products] "${spec.shopName}" already has ${existingCount} — skipping`);
      skipped.push(spec.shopName);
      perSellerCounts[spec.shopName] = existingCount;
      continue;
    }
    const anchorCount = Math.round(spec.total * 0.8);
    const crossTotal = spec.total - anchorCount;
    const crossEach = Math.floor(crossTotal / spec.cross.length);
    const crossRem = crossTotal - crossEach * spec.cross.length;

    const sellerProducts = buildProductsForCategory(spec.anchor, anchorCount, sellerId);
    perCategoryCounts[spec.anchor] = (perCategoryCounts[spec.anchor] || 0) + anchorCount;
    spec.cross.forEach((cat, idx) => {
      const n = crossEach + (idx < crossRem ? 1 : 0);
      sellerProducts.push(...buildProductsForCategory(cat, n, sellerId));
      perCategoryCounts[cat] = (perCategoryCounts[cat] || 0) + n;
    });
    perSellerCounts[spec.shopName] = sellerProducts.length;
    toInsert.push(...sellerProducts);
    console.log(`  [products] "${spec.shopName}": ${sellerProducts.length} (anchor=${spec.anchor} x${anchorCount}, cross ${spec.cross.join('/')} x~${crossEach})`);
  }

  // ── 3. Hero products (real model-exact images) ───────────────────────────
  let heroPlanned = 0;
  const anchorByCategory = {};
  for (const spec of SELLERS) anchorByCategory[spec.anchor] = sellerDocs[spec.key]._id;
  for (const hero of HERO_PRODUCTS) {
    const sellerId = anchorByCategory[hero.category] || sellerDocs.other._id;
    // Idempotency for heroes: skip if a product with this exact hero name already exists for that seller.
    const exists = await Product.findOne({ name: hero.name, seller: sellerId });
    if (exists) continue;
    toInsert.push({
      name: hero.name,
      description: hero.description,
      price: hero.price,
      comparePrice: hero.comparePrice || null,
      images: [{ url: hero.imageUrl, publicId: `seed-demo-hero-${slugify(hero.name)}`.slice(0, 100) }],
      category: hero.category,
      stock: hero.stock || randInt(10, 50),
      seller: sellerId,
      isActive: true,
      deactivatedBySystem: false,
      isFeatured: true,
      heroProduct: true, // marker (not in schema — ignored by mongoose strict, but kept for clarity in code)
      rating: hero.rating != null ? hero.rating : +(randInt(38, 50) / 10).toFixed(1),
      numReviews: hero.numReviews != null ? hero.numReviews : randInt(20, 800),
      discount: hero.discount || 0,
    });
    perCategoryCounts[hero.category] = (perCategoryCounts[hero.category] || 0) + 1;
    heroPlanned++;
  }
  console.log(`\n  [hero] ${heroPlanned} hero products planned (real/verified images from heroProducts.js)`);

  console.log(`\nTotal products to insert: ${toInsert.length}`);

  // ── 4. Embed + insert in chunks ──────────────────────────────────────────
  let inserted = 0;
  let embedFailures = 0;
  const tEmbed = Date.now();
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const t0 = Date.now();
    for (const p of chunk) {
      try {
        const vec = await embedDocument(buildProductText(p));
        if (vec) p.embedding = vec;
      } catch (err) {
        embedFailures++;
        console.error(`  [embed] failed "${p.name}": ${err.message}`);
      }
    }
    try {
      await Product.insertMany(chunk, { ordered: false });
      inserted += chunk.length;
    } catch (err) {
      console.error(`  [insert] chunk @${i} errors: ${err.message}`);
      inserted += chunk.length - (err.writeErrors ? err.writeErrors.length : 0);
    }
    console.log(`  chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(toInsert.length / CHUNK_SIZE)}: +${chunk.length} (${inserted}/${toInsert.length}) ${Date.now() - t0}ms`);
  }
  const embedMs = Date.now() - tEmbed;

  // ── 5. Report ────────────────────────────────────────────────────────────
  console.log('\n── Per-seller counts (planned this run) ─────────');
  for (const [shop, c] of Object.entries(perSellerCounts)) if (shop) console.log(`  ${shop}: ${c}`);

  console.log('\n── Live per-seller totals (DB) ──────────────────');
  for (const spec of SELLERS) {
    const c = await Product.countDocuments({ seller: sellerDocs[spec.key]._id });
    console.log(`  ${spec.shopName}: ${c}`);
  }

  const catAgg = await Product.aggregate([
    { $match: { seller: { $in: allSellerIds } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log('\n── Live category totals (DB, seed sellers) ──────');
  catAgg.forEach((c) => console.log(`  ${c._id}: ${c.count}`));

  // Price distribution per category (min / median / max).
  console.log('\n── Price distribution per category (NPR) ────────');
  for (const c of catAgg) {
    const prices = (await Product.find({ seller: { $in: allSellerIds }, category: c._id }).select('price').lean())
      .map((p) => p.price).sort((a, b) => a - b);
    const med = prices[Math.floor(prices.length / 2)];
    console.log(`  ${c._id}: min=${prices[0]} median=${med} max=${prices[prices.length - 1]}  (n=${prices.length})`);
  }

  const totalSeed = await Product.countDocuments({ seller: { $in: allSellerIds } });
  const withEmb = await Product.countDocuments({ seller: { $in: allSellerIds }, 'embedding.0': { $exists: true } });
  console.log('\n── Embedding coverage ───────────────────────────');
  console.log(`  Total seed products: ${totalSeed}`);
  console.log(`  With embedding     : ${withEmb}`);
  console.log(`  Missing embedding  : ${totalSeed - withEmb}`);
  console.log(`  Embed failures this run: ${embedFailures}`);
  console.log(`  Embedding phase: ${embedMs}ms (${(embedMs / Math.max(1, toInsert.length)).toFixed(1)}ms/product this run)`);

  console.log(`\nTotal runtime: ${((Date.now() - tStart) / 1000 / 60).toFixed(2)} min`);
  if (skipped.length) console.log(`Skipped (already seeded): ${skipped.join(', ')}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
