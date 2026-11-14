const mongoose = require('mongoose');

// One active request per booking (unique). A rejected request is replaced by deleting
// it first, then creating the new one (see controller).
const PickupRequestSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.ObjectId, ref: 'Booking', required: true, unique: true },
    user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    provider: { type: mongoose.Schema.ObjectId, ref: 'Provider', required: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    region: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewNote: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

PickupRequestSchema.index({ provider: 1, status: 1 });

module.exports = mongoose.model('PickupRequest', PickupRequestSchema);
