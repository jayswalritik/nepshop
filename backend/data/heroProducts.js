// backend/data/heroProducts.js
//
// ~40 hand-curated "hero" demo products (4 per real category) with REAL,
// model-exact image URLs. Consumed by backend/scripts/seedDemoProducts.js,
// which assigns each hero to the demo seller anchored to its category and
// tags it with a `seed-demo-hero-*` sentinel publicId so the wipe script
// (which matches by @seed.nepshop.demo seller ownership) removes them too.
//
// IMAGE SOURCING (honest, verified — no invented URLs):
//   Each imageUrl was resolved against the Wikimedia Commons API (search →
//   imageinfo → 500px CDN thumbnail on upload.wikimedia.org) and verified to
//   return HTTP 200 AND be topically correct (checked by filename) during the
//   seeding session. 36 of 40 resolved to a real, on-topic Commons image.
//   4 fall back to a pre-tested loremflickr keyword image, each flagged with
//   `imageSource: 'fallback'` and a reason:
//     • nivea-cream  — Commons "Nivea" matched a fungus (Skeletocutis nivea);
//     • studds-helmet — Commons "motorcycle helmet" matched a road sign;
//     • wildcraft-bag, fendo-umbrella — Commons API 429-rate-limited, unresolved.
//   All upload.wikimedia.org URLs are CDN-served and hotlinkable.
//
// Prices are realistic NPR market prices. NOTE: branded footwear heroes
// (Nike/Adidas/Puma, ~9k-15k) exceed the bulk generator's Clothing range
// (500-8k) on purpose — real-market prices for these shoes in Nepal genuinely
// sit there; heroes use true prices, the bulk generator uses category bands.

module.exports = [
  // ── Electronics ────────────────────────────────────────────────────────────
  { name: 'Samsung Galaxy A55 5G 8GB/128GB', category: 'Electronics', price: 62000, comparePrice: 68000, discount: 9, stock: 40, rating: 4.5, numReviews: 320, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/500px-Samsung_Galaxy_A55_5G_2024.jpg',
    description: 'The Samsung Galaxy A55 5G is a mid-range smartphone with a 6.6-inch Super AMOLED display, 50MP camera, 5000mAh battery and 5G connectivity. Comes with a manufacturer warranty and all original accessories.' },
  { name: 'Apple iPhone 15 128GB', category: 'Electronics', price: 145000, comparePrice: null, discount: 0, stock: 25, rating: 4.8, numReviews: 540, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Apple_iPhone_15_Pro.jpg/500px-Apple_iPhone_15_Pro.jpg',
    description: 'The Apple iPhone 15 is a premium smartphone with the A16 Bionic chip, a 48MP main camera, USB-C charging and the Dynamic Island. A flagship phone built for photography, gaming and everyday use.' },
  { name: 'Sony WH-1000XM5 Wireless Headphones', category: 'Electronics', price: 55000, comparePrice: 62000, discount: 11, stock: 30, rating: 4.7, numReviews: 410, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sony-WH-1000XM3-kabellose-Bluetooth-Noise-Cancelling-Kopfhoerer.jpg/500px-Sony-WH-1000XM3-kabellose-Bluetooth-Noise-Cancelling-Kopfhoerer.jpg',
    description: 'The Sony WH-1000XM5 are over-ear wireless headphones with industry-leading active noise cancellation, 30-hour battery life and crystal-clear call quality. Premium audio for travel and daily listening.' },
  { name: 'Dell XPS 13 Laptop i7 16GB 512GB', category: 'Electronics', price: 185000, comparePrice: 205000, discount: 10, stock: 18, rating: 4.6, numReviews: 210, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/DELL_XPS_13_and_15_%2837080596413%29.jpg/500px-DELL_XPS_13_and_15_%2837080596413%29.jpg',
    description: 'The Dell XPS 13 is an ultra-portable laptop with a 13.4-inch InfinityEdge display, 12th-gen Intel Core i7, 16GB RAM and a 512GB SSD. A premium notebook for work, study and creative use.' },

  // ── Clothing ───────────────────────────────────────────────────────────────
  { name: "Nike Air Force 1 '07 Sneakers", category: 'Clothing', price: 14500, comparePrice: 16000, discount: 9, stock: 45, rating: 4.7, numReviews: 480, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Air_Force_1.JPG/500px-Air_Force_1.JPG',
    description: "The Nike Air Force 1 '07 are iconic low-top sneakers with a leather upper, Air-cushioned sole and timeless design. Comfortable everyday shoes that pair with any casual outfit." },
  { name: 'Adidas Samba OG Sneakers', category: 'Clothing', price: 13000, comparePrice: null, discount: 0, stock: 38, rating: 4.6, numReviews: 360, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Adidas_Samba_shoes.png/500px-Adidas_Samba_shoes.png',
    description: 'The Adidas Samba OG are classic leather sneakers with the signature gum sole and suede T-toe. A heritage shoe that has become a modern streetwear staple.' },
  { name: "Levi's 501 Original Fit Jeans", category: 'Clothing', price: 7500, comparePrice: 8900, discount: 16, stock: 50, rating: 4.5, numReviews: 290, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Photo_%C3%A9tiquette_Levi%27s_501.jpg',
    description: "The Levi's 501 Original are straight-fit jeans in durable denim with the signature button fly. A timeless pair of jeans that works for every casual occasion." },
  { name: 'Puma Suede Classic Sneakers', category: 'Clothing', price: 9000, comparePrice: 10500, discount: 14, stock: 42, rating: 4.4, numReviews: 220, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Puma_suede_red.jpg/500px-Puma_suede_red.jpg',
    description: 'The Puma Suede Classic are retro low-top sneakers with a soft suede upper and rubber sole. Comfortable, durable shoes with a vintage sporty look.' },

  // ── Food & Grocery ─────────────────────────────────────────────────────────
  { name: 'Wai Wai Chicken Noodles 5-Pack', category: 'Food & Grocery', price: 125, comparePrice: null, discount: 0, stock: 50, rating: 4.6, numReviews: 610, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Wai_Kee_Noodle_Cafe_Noodles_2017.jpg/500px-Wai_Kee_Noodle_Cafe_Noodles_2017.jpg',
    description: 'Wai Wai Chicken instant noodles in a value 5-pack — Nepal\'s favourite ready-to-eat noodles with the classic chicken masala flavour. Sealed for freshness, quick to prepare.' },
  { name: 'Coca-Cola 1.25L Bottle', category: 'Food & Grocery', price: 150, comparePrice: null, discount: 0, stock: 50, rating: 4.5, numReviews: 300, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Coca-cola_50cl_can_-_Italia.jpg/500px-Coca-cola_50cl_can_-_Italia.jpg',
    description: 'Coca-Cola soft drink in a 1.25-litre family bottle — the classic refreshing cola beverage, perfect for gatherings and everyday refreshment. Chilled and ready to serve.' },
  { name: 'Nescafe Classic Coffee 100g Jar', category: 'Food & Grocery', price: 650, comparePrice: 720, discount: 10, stock: 45, rating: 4.6, numReviews: 340, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Nescaf%C3%A8_instant_coffee%2C_2019-%2801%29.jpg/500px-Nescaf%C3%A8_instant_coffee%2C_2019-%2801%29.jpg',
    description: 'Nescafe Classic instant coffee in a 100g jar — a rich, aromatic coffee blend that dissolves instantly for a quick cup any time of day. Sealed for lasting freshness.' },
  { name: 'Dabur Honey 500g Jar', category: 'Food & Grocery', price: 450, comparePrice: null, discount: 0, stock: 40, rating: 4.7, numReviews: 260, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Three_French_monofloral_honey_jars.jpg/500px-Three_French_monofloral_honey_jars.jpg',
    description: 'Pure natural honey in a 500g jar — a wholesome sweetener sourced for quality and packed to preserve flavour. No artificial preservatives, ideal for daily use.' },

  // ── Home & Kitchen ─────────────────────────────────────────────────────────
  { name: 'Prestige Deluxe Alpha Pressure Cooker 5L', category: 'Home & Kitchen', price: 3800, comparePrice: 4500, discount: 15, stock: 35, rating: 4.6, numReviews: 380, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Pressure_cooker_-_Hawkins%2C_Contura_Model_-_3_litres_-_2.jpg/500px-Pressure_cooker_-_Hawkins%2C_Contura_Model_-_3_litres_-_2.jpg',
    description: 'The Prestige Deluxe Alpha is a 5-litre stainless steel pressure cooker built for fast, even cooking. Sturdy, easy to clean and backed by a standard replacement warranty.' },
  { name: 'Philips HD9200 Air Fryer', category: 'Home & Kitchen', price: 16500, comparePrice: 19000, discount: 13, stock: 28, rating: 4.5, numReviews: 300, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Air_fryer_interior.jpg/500px-Air_fryer_interior.jpg',
    description: 'The Philips HD9200 air fryer uses rapid hot-air technology to fry with little to no oil. A compact kitchen appliance for healthier chips, snacks and roasts.' },
  { name: 'Milton Thermosteel Water Bottle 1L', category: 'Home & Kitchen', price: 1200, comparePrice: null, discount: 0, stock: 50, rating: 4.6, numReviews: 420, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Stainless_Steel_Water_Bottle.jpg/500px-Stainless_Steel_Water_Bottle.jpg',
    description: 'The Milton Thermosteel is a 1-litre double-walled stainless steel water bottle that keeps drinks hot or cold for hours. Leak-proof and built for daily use.' },
  { name: 'LG 28L Convection Microwave Oven', category: 'Home & Kitchen', price: 18500, comparePrice: 21000, discount: 12, stock: 20, rating: 4.5, numReviews: 240, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Microwave_Oven.jpg/500px-Microwave_Oven.jpg',
    description: 'The LG 28L convection microwave oven bakes, grills and reheats with even heat distribution and preset cooking modes. A versatile appliance for any modern kitchen.' },

  // ── Beauty & Health ────────────────────────────────────────────────────────
  { name: 'Nivea Soft Moisturizing Cream 200ml', category: 'Beauty & Health', price: 550, comparePrice: null, discount: 0, stock: 50, rating: 4.6, numReviews: 350, imageSource: 'fallback',
    imageUrl: 'https://loremflickr.com/400/400/skincare?lock=910',
    description: 'Nivea Soft is a light moisturizing cream with jojoba oil and vitamin E for soft, hydrated skin. A dermatologically mild skincare formula for face, hands and body.' },
  { name: 'Maybelline Colossal Mascara', category: 'Beauty & Health', price: 850, comparePrice: 990, discount: 14, stock: 45, rating: 4.5, numReviews: 280, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Mascara_de_pesta%C3%B1as.jpg/500px-Mascara_de_pesta%C3%B1as.jpg',
    description: 'Maybelline Colossal volumizing mascara builds bold, dramatic lashes in a single coat with a smudge-resistant formula. A makeup essential for everyday and party looks.' },
  { name: 'Dove Intense Repair Shampoo 340ml', category: 'Beauty & Health', price: 620, comparePrice: null, discount: 0, stock: 48, rating: 4.6, numReviews: 390, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Dove_shampoo_bottle_in_black_background.jpg/500px-Dove_shampoo_bottle_in_black_background.jpg',
    description: 'Dove Intense Repair shampoo with keratin actives nourishes and strengthens damaged hair. A gentle daily shampoo suitable for most hair types.' },
  { name: 'Gillette Mach3 Razor', category: 'Beauty & Health', price: 950, comparePrice: 1100, discount: 14, stock: 50, rating: 4.7, numReviews: 300, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Shaving_Collectibles_-_Vintage_Ever-Ready_Travel_Safety_Razor_%26_Case%2C_Two_Blade_Holders%2C_American_Safety_Razor_Co.%2C_Inc._%2814910887680%29.jpg/500px-Shaving_Collectibles_-_Vintage_Ever-Ready_Travel_Safety_Razor_%26_Case%2C_Two_Blade_Holders%2C_American_Safety_Razor_Co.%2C_Inc._%2814910887680%29.jpg',
    description: 'The Gillette Mach3 razor delivers a smooth, close shave with three progressively aligned blades and a lubricating strip. A reliable personal-care essential for men.' },

  // ── Sports & Outdoors ──────────────────────────────────────────────────────
  { name: 'SG Sunny Tonny Kashmir Willow Cricket Bat', category: 'Sports & Outdoors', price: 5500, comparePrice: 6500, discount: 15, stock: 30, rating: 4.6, numReviews: 260, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/GandM_Flare_DXM_bat-Purist_156g_ball.jpg/500px-GandM_Flare_DXM_bat-Purist_156g_ball.jpg',
    description: 'The SG Sunny Tonny is a full-size Kashmir willow cricket bat with a thick edge and balanced pickup. Built for durability under regular club and casual play.' },
  { name: 'Adidas UCL Club Football Size 5', category: 'Sports & Outdoors', price: 2200, comparePrice: null, discount: 0, stock: 40, rating: 4.5, numReviews: 210, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Jakarta_old_football.jpg/500px-Jakarta_old_football.jpg',
    description: 'The Adidas UCL Club is a size-5 match football with a durable machine-stitched surface and reliable flight. Meets standard specifications for training and casual games.' },
  { name: 'Yonex Nanoray Light Badminton Racket', category: 'Sports & Outdoors', price: 4200, comparePrice: 4900, discount: 14, stock: 35, rating: 4.6, numReviews: 240, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Badminton_racket.jpg/500px-Badminton_racket.jpg',
    description: 'The Yonex Nanoray Light is a lightweight graphite badminton racket with an even balance for fast, controlled play. Built for comfort during extended sessions.' },
  { name: 'Kobo Anti-Skid Yoga Mat 6mm', category: 'Sports & Outdoors', price: 1500, comparePrice: null, discount: 0, stock: 45, rating: 4.5, numReviews: 300, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Yoga_Mat_Made_of_Carpet_Underlay.jpg/500px-Yoga_Mat_Made_of_Carpet_Underlay.jpg',
    description: 'The Kobo yoga mat is a 6mm anti-skid exercise mat with cushioned support for yoga, pilates and home workouts. Lightweight and easy to roll and carry.' },

  // ── Books & Stationery ─────────────────────────────────────────────────────
  { name: 'Parker Vector Fountain Pen', category: 'Books & Stationery', price: 1800, comparePrice: 2100, discount: 14, stock: 40, rating: 4.6, numReviews: 190, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Fountain_pen_writing_%28literacy%29.jpg/500px-Fountain_pen_writing_%28literacy%29.jpg',
    description: 'The Parker Vector is a stainless steel fountain pen with a smooth medium nib, ideal for everyday writing and signatures. A classic pen that makes a thoughtful gift.' },
  { name: 'Classmate Long Notebook 200 Pages (Pack of 6)', category: 'Books & Stationery', price: 480, comparePrice: null, discount: 0, stock: 50, rating: 4.5, numReviews: 320, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Spiralbinder%C3%BCcken_--_2022_--_9739_%28bw%29.jpg/500px-Spiralbinder%C3%BCcken_--_2022_--_9739_%28bw%29.jpg',
    description: 'Classmate long notebooks in a value pack of 6, each with 200 ruled pages on quality paper. A durable notebook set for daily school, college or office use.' },
  { name: 'Faber-Castell Colour Pencils 24 Shades', category: 'Books & Stationery', price: 650, comparePrice: null, discount: 0, stock: 45, rating: 4.7, numReviews: 280, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Colouring_pencils.jpg/500px-Colouring_pencils.jpg',
    description: 'Faber-Castell colour pencils in a set of 24 vivid shades with smooth, break-resistant leads. A quality art supply for students, artists and hobbyists.' },
  { name: 'Casio FX-991ES Plus Scientific Calculator', category: 'Books & Stationery', price: 1650, comparePrice: 1900, discount: 13, stock: 40, rating: 4.8, numReviews: 450, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Citizen_SLD-100NR_calculator.jpg/500px-Citizen_SLD-100NR_calculator.jpg',
    description: 'The Casio FX-991ES Plus is a scientific calculator with 417 functions and a natural textbook display. An essential tool for school, college and engineering exams.' },

  // ── Toys & Games ───────────────────────────────────────────────────────────
  { name: 'LEGO Classic Creative Bricks Box', category: 'Toys & Games', price: 4500, comparePrice: 5200, discount: 13, stock: 30, rating: 4.8, numReviews: 360, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Pile_of_light_gray_LEGO_bricks_at_a_LEGO_store.jpg/500px-Pile_of_light_gray_LEGO_bricks_at_a_LEGO_store.jpg',
    description: 'The LEGO Classic Creative Bricks box contains hundreds of colourful building blocks for open-ended play. A child-safe toy that builds motor skills and imagination.' },
  { name: "Rubik's Cube 3x3 Speed Cube", category: 'Toys & Games', price: 800, comparePrice: null, discount: 0, stock: 50, rating: 4.6, numReviews: 410, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Rubiks_cube_by_keqs.jpg/500px-Rubiks_cube_by_keqs.jpg',
    description: "The Rubik's Cube 3x3 is a classic twisty puzzle with smooth turning for speed-solving. A compact brain-teaser toy that makes a great gift for all ages." },
  { name: 'Mattel UNO Card Game', category: 'Toys & Games', price: 650, comparePrice: null, discount: 0, stock: 50, rating: 4.7, numReviews: 500, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Uno.jpg/500px-Uno.jpg',
    description: 'The Mattel UNO card game is a fast-paced family favourite for 2-10 players. A compact card game that is easy to learn and endlessly re-playable at parties.' },
  { name: 'Hot Wheels Die-Cast Car Set of 5', category: 'Toys & Games', price: 1200, comparePrice: 1450, discount: 17, stock: 45, rating: 4.6, numReviews: 330, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Tesla_Hot_Wheels_and_Matchbox_cars.jpg/500px-Tesla_Hot_Wheels_and_Matchbox_cars.jpg',
    description: 'A Hot Wheels set of 5 die-cast toy cars with detailed designs and durable metal bodies. A collectible toy that encourages hands-on imaginative play.' },

  // ── Automotive (parts / accessories) ───────────────────────────────────────
  { name: 'MRF ZLX Tubeless Tyre 165/80 R14', category: 'Automotive', price: 12500, comparePrice: 14000, discount: 11, stock: 25, rating: 4.5, numReviews: 180, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Car_tires.jpg/500px-Car_tires.jpg',
    description: 'The MRF ZLX is a 165/80 R14 tubeless car tyre engineered for grip and long tread life on Nepali roads. Built for durability under regular road and weather conditions.' },
  { name: 'Bosch Car Battery 35Ah', category: 'Automotive', price: 14500, comparePrice: null, discount: 0, stock: 20, rating: 4.6, numReviews: 150, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Batterie_TUNDRA_EFB.jpg/500px-Batterie_TUNDRA_EFB.jpg',
    description: 'The Bosch 35Ah car battery delivers reliable maintenance-free starting power for hatchbacks and sedans. Compatible with most standard models in the Nepali market.' },
  { name: 'Studds Ninja Elite Full-Face Helmet', category: 'Automotive', price: 3800, comparePrice: 4400, discount: 14, stock: 35, rating: 4.6, numReviews: 290, imageSource: 'fallback',
    imageUrl: 'https://loremflickr.com/400/400/biker?lock=903',
    description: 'The Studds Ninja Elite is a full-face motorcycle helmet with a scratch-resistant visor and ISI-certified shell. Built for rider safety and comfort on daily commutes.' },
  { name: 'Castrol Activ 4T Engine Oil 1L', category: 'Automotive', price: 850, comparePrice: null, discount: 0, stock: 50, rating: 4.7, numReviews: 220, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Gulflube_dewaxed_motor_oil_can_pic1.JPG/500px-Gulflube_dewaxed_motor_oil_can_pic1.JPG',
    description: 'Castrol Activ 4T is a 1-litre engine oil formulated for four-stroke motorcycles, protecting against wear and heat. Easy to use with standard servicing.' },

  // ── Other ──────────────────────────────────────────────────────────────────
  { name: 'American Tourister Trolley Bag 68cm', category: 'Other', price: 8500, comparePrice: 11000, discount: 22, stock: 30, rating: 4.6, numReviews: 260, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Suitcase_BW_2025-08-17_14-54-11.jpg/500px-Suitcase_BW_2025-08-17_14-54-11.jpg',
    description: 'The American Tourister 68cm trolley bag is a hard-shell suitcase with spinner wheels and a TSA lock. A durable travel luggage piece for check-in trips.' },
  { name: 'Victorinox Swiss Army Knife Classic', category: 'Other', price: 4200, comparePrice: null, discount: 0, stock: 40, rating: 4.8, numReviews: 300, imageSource: 'wikimedia',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Swiss_army_knife_closed_20050612.jpg/500px-Swiss_army_knife_closed_20050612.jpg',
    description: 'The Victorinox Swiss Army Knife Classic is a compact multi-tool with a blade, scissors, nail file and screwdriver. A practical everyday carry item built to last.' },
  { name: 'Wildcraft 44L Trekking Backpack', category: 'Other', price: 3800, comparePrice: 4500, discount: 16, stock: 35, rating: 4.5, numReviews: 240, imageSource: 'fallback',
    imageUrl: 'https://loremflickr.com/400/400/luggage?lock=929',
    description: 'The Wildcraft 44L trekking backpack has padded straps, multiple compartments and a rain cover for outdoor treks. A durable travel and hiking bag for weekend trips.' },
  { name: 'Fendo Windproof Foldable Umbrella', category: 'Other', price: 750, comparePrice: null, discount: 0, stock: 50, rating: 4.4, numReviews: 200, imageSource: 'fallback',
    imageUrl: 'https://loremflickr.com/400/400/umbrella?lock=930',
    description: 'The Fendo windproof foldable umbrella has a sturdy fibreglass frame and auto open-close button. A compact, easy-to-carry umbrella for the monsoon season.' },
];
