const mongoose = require('mongoose');

// A car serves its provider's serviceRegions (no region of its own).
const CarSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.ObjectId, ref: 'Provider', required: true, index: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    licensePlate: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['sedan', 'suv', 'hatchback', 'van', 'pickup'] },
    seats: { type: Number, min: 2, max: 15 },
    dailyRate: { type: Number, required: true, min: 0.01 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

CarSchema.virtual('bookings', { ref: 'Booking', localField: '_id', foreignField: 'car' });

module.exports = mongoose.model('Car', CarSchema);
