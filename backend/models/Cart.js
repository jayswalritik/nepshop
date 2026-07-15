const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    default: 1,
  },
  price: {
    type: Number,
    required: true, // Snapshot of price at time of adding
  },
  // Selective checkout (Daraz-style) — whether this item is part of the NEXT
  // checkout. Existing carts predating this field have it undefined; every
  // read site must treat that as true (see backend/utils/cartSelection.js) —
  // Mongoose's own `default: true` already covers freshly-loaded documents,
  // but code must not rely on strict `=== true` checks.
  selected: {
    type: Boolean,
    default: true,
  },
});

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One cart per customer
    },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

// Virtual: calculate total
cartSchema.virtual('total').get(function () {
  return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

// Virtual: total items count
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

module.exports = mongoose.model('Cart', cartSchema);