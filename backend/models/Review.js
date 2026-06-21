const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true, // Can only review if you ordered it
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      maxlength: [500, 'Review cannot exceed 500 characters'],
    },
  },
  { timestamps: true }
);

// One review per customer per product per order
reviewSchema.index({ product: 1, customer: 1, order: 1 }, { unique: true });

// Update product rating after save
reviewSchema.post('save', async function () {
  const Product = require('./Product');
  const stats = await mongoose.model('Review').aggregate([
    { $match: { product: this.product } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (stats.length > 0) {
    await Product.findByIdAndUpdate(this.product, {
      rating:     +stats[0].avgRating.toFixed(1),
      numReviews: stats[0].count,
    });
  }
});

// Update product rating after delete
reviewSchema.post('deleteOne', { document: true }, async function () {
  const Product = require('./Product');
  const stats = await mongoose.model('Review').aggregate([
    { $match: { product: this.product } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(this.product, {
    rating:     stats.length > 0 ? +stats[0].avgRating.toFixed(1) : 0,
    numReviews: stats.length > 0 ? stats[0].count : 0,
  });
});

module.exports = mongoose.model('Review', reviewSchema);