const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./models/Product');
const User = require('./models/User');
const fetchDummyProducts = require('./data/fetchDummyProducts');
const customCategoryProducts = require('./data/customCategoryProducts');
const { embedDocument, buildProductText } = require('./services/embeddingService'); // Phase2

dotenv.config();

const SELLER_CATEGORY_MAP = {
  'electronics@nepshop.com': 'Electronics',
  'clothing@nepshop.com': 'Clothing',
  'grocery@nepshop.com': 'Food & Grocery',
  'home@nepshop.com': 'Home & Kitchen',
  'beauty@nepshop.com': 'Beauty & Health',
  'sports@nepshop.com': 'Sports & Outdoors',
  'books@nepshop.com': 'Books & Stationery',
  'toys@nepshop.com': 'Toys & Games',
  'auto@nepshop.com': 'Automotive',
  'other@nepshop.com': 'Other',
};

const REQUIRED_PRODUCTS_PER_SELLER = 10;

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const cloneProduct = (product, sellerId) => ({
  ...product,
  seller: sellerId,
});

const buildCategoryProductPool = (dummyProductsByCategory) => {
  const merged = { ...dummyProductsByCategory };

  for (const [category, products] of Object.entries(customCategoryProducts)) {
    if (!merged[category]) {
      merged[category] = [];
    }
    merged[category].push(...products);
  }

  return merged;
};

const seedProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Remove old products
    await Product.deleteMany();
    console.log('🗑️ Existing products deleted');

    // Fetch all seller accounts we created
    const sellerEmails = Object.keys(SELLER_CATEGORY_MAP);
    const sellers = await User.find({
      email: { $in: sellerEmails },
      role: 'seller',
    });

    if (sellers.length !== sellerEmails.length) {
      const foundEmails = sellers.map((s) => s.email);
      const missing = sellerEmails.filter((email) => !foundEmails.includes(email));
      throw new Error(`Missing seller accounts: ${missing.join(', ')}`);
    }

    // Fetch DummyJSON grouped products
    const dummyProductsByCategory = await fetchDummyProducts();

    // Merge with custom products
    const productPool = buildCategoryProductPool(dummyProductsByCategory);

    const finalProducts = [];

    for (const seller of sellers) {
      const category = SELLER_CATEGORY_MAP[seller.email];
      const categoryProducts = ensureArray(productPool[category]);

      if (categoryProducts.length < REQUIRED_PRODUCTS_PER_SELLER) {
        throw new Error(
          `Not enough products for category "${category}". Found ${categoryProducts.length}, need ${REQUIRED_PRODUCTS_PER_SELLER}.`
        );
      }

      const selectedProducts = categoryProducts
        .slice(0, REQUIRED_PRODUCTS_PER_SELLER)
        .map((product) => cloneProduct(product, seller._id));

      finalProducts.push(...selectedProducts);

      console.log(
        `📦 Prepared ${selectedProducts.length} products for ${seller.shopName || seller.email} (${category})`
      );
    }

    // ── Phase 2: embed every product BEFORE inserting ─────────────────────────
    // insertMany bypasses the controller, so we generate the semantic vector
    // here. This is what makes ANY seeded product — now or in the future —
    // immediately findable by meaning, with no separate backfill step.
    // The first embed() call loads the model once (~23MB download on first run).
    console.log('🧠 Generating embeddings (first run downloads the model)...');
    let embedded = 0;
    for (const product of finalProducts) {
      try {
        product.embedding = await embedDocument(buildProductText(product));
      } catch (err) {
        console.warn(`   embedding failed for "${product.name}" (will still insert):`, err.message);
      }
      embedded++;
      if (embedded % 20 === 0 || embedded === finalProducts.length) {
        console.log(`   embedded ${embedded}/${finalProducts.length}`);
      }
    }

    await Product.insertMany(finalProducts);

    console.log(`🎉 Successfully seeded ${finalProducts.length} products across ${sellers.length} sellers`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Product seed failed:', error.message);
    process.exit(1);
  }
};

seedProducts();