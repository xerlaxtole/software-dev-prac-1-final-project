const mongoose = require('mongoose');

// region must be within the provider's serviceRegions — enforced in the controller
// (cross-document check), since it depends on the parent provider.
const PickupLocationSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.ObjectId, ref: 'Provider', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    region: { type: String, required: true },
  },
  { timestamps: true }
);

PickupLocationSchema.index({ provider: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PickupLocation', PickupLocationSchema);
