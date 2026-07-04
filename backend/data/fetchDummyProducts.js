const axios = require('axios');
const categoryMap = require('./categoryMap');

const DUMMYJSON_URL = 'https://dummyjson.com/products?limit=200';

const makeImageObjects = (product) => {
  const urls = Array.isArray(product.images) && product.images.length
    ? product.images.slice(0, 5)
    : product.thumbnail
      ? [product.thumbnail]
      : [];

  return urls.map((url, index) => ({
    url,
    publicId: `dummyjson-${product.id || product.title}-${index}`,
  }));
};

const transformProduct = (product, mappedCategory) => {
  const discount = Math.round(product.discountPercentage || 0);
  const comparePrice =
    discount > 0
      ? Math.round(product.price / (1 - discount / 100))
      : null;

  return {
    name: product.title,
    description: product.description,
    price: Math.round(product.price),
    comparePrice,
    images: makeImageObjects(product),
    category: mappedCategory,
    stock: product.stock || 0,
    discount,
    isActive: true,
    isFeatured: false,
    rating: product.rating || 0,
    numReviews: 0,
  };
};

const fetchDummyProducts = async () => {
  try {
    const { data } = await axios.get(DUMMYJSON_URL);

    if (!data.products || !Array.isArray(data.products)) {
      throw new Error('Invalid DummyJSON response format');
    }

    const groupedProducts = {};

    for (const product of data.products) {
      const mappedCategory = categoryMap[product.category];
      if (!mappedCategory) continue; // skip categories we don't use

      const transformed = transformProduct(product, mappedCategory);

      if (!groupedProducts[mappedCategory]) {
        groupedProducts[mappedCategory] = [];
      }

      groupedProducts[mappedCategory].push(transformed);
    }

    return groupedProducts;
  } catch (error) {
    console.error('❌ Error fetching DummyJSON products:', error.message);
    throw error;
  }
};

module.exports = fetchDummyProducts;