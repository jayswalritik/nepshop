const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

// Absolute path — must not depend on the directory this script is launched from.
dotenv.config({ path: path.join(__dirname, '.env') });

const sellers = [
  {
    firstName: 'Tech',
    lastName: 'Hub',
    email: 'electronics@nepshop.com',
    phone: '9800000001',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'TechHub Nepal',
    category: 'Electronics',
  },
  {
    firstName: 'Style',
    lastName: 'Wear',
    email: 'clothing@nepshop.com',
    phone: '9800000002',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'StyleWear Nepal',
    category: 'Clothing',
  },
  {
    firstName: 'Daily',
    lastName: 'Basket',
    email: 'grocery@nepshop.com',
    phone: '9800000003',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'Daily Basket',
    category: 'Food & Grocery',
  },
  {
    firstName: 'Home',
    lastName: 'Ease',
    email: 'home@nepshop.com',
    phone: '9800000004',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'HomeEase Nepal',
    category: 'Home & Kitchen',
  },
  {
    firstName: 'Glow',
    lastName: 'Care',
    email: 'beauty@nepshop.com',
    phone: '9800000005',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'GlowCare Nepal',
    category: 'Beauty & Health',
  },
  {
    firstName: 'Fit',
    lastName: 'Gear',
    email: 'sports@nepshop.com',
    phone: '9800000006',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'FitGear Nepal',
    category: 'Sports & Outdoors',
  },
  {
    firstName: 'Book',
    lastName: 'Nest',
    email: 'books@nepshop.com',
    phone: '9800000007',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'BookNest Nepal',
    category: 'Books & Stationery',
  },
  {
    firstName: 'Fun',
    lastName: 'Zone',
    email: 'toys@nepshop.com',
    phone: '9800000008',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'FunZone Kids',
    category: 'Toys & Games',
  },
  {
    firstName: 'Auto',
    lastName: 'Mart',
    email: 'auto@nepshop.com',
    phone: '9800000009',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'AutoMart Nepal',
    category: 'Automotive',
  },
  {
    firstName: 'Mixed',
    lastName: 'Mart',
    email: 'other@nepshop.com',
    phone: '9800000010',
    password: 'Test1234',
    role: 'seller',
    roles: ['seller'],
    activeRole: 'seller',
    status: 'active',
    shopName: 'MixedMart Nepal',
    category: 'Other',
  },
];

const seedSellers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    for (const seller of sellers) {
      const existingSeller = await User.findOne({ email: seller.email });

      if (existingSeller) {
        console.log(`⚠️ Seller already exists: ${seller.email}`);
        continue;
      }

      const { category, ...sellerData } = seller; // category not stored in User schema
      await User.create(sellerData);
      console.log(`✅ Seller created: ${seller.email} (${category})`);
    }

    console.log('🎉 Seller seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seller seed failed:', error.message);
    process.exit(1);
  }
};

seedSellers();