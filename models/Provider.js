const mongoose = require('mongoose');
const Region = require('./Region');

const ProviderSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Please add a name'], unique: true, trim: true, maxlength: 100 },
    address: { type: String, required: [true, 'Please add an address'] },
    tel: { type: String, required: [true, 'Please add a telephone number'] },
    owner: { type: mongoose.Schema.ObjectId, ref: 'User', required: true, unique: true },
    serviceRegions: {
      type: [String],
      default: [],
      // Each value must be unique and exist in the seeded regions master list.
      validate: {
        validator: async function (regions) {
          const unique = new Set(regions);
          if (unique.size !== regions.length) return false;
          if (unique.size === 0) return true;
          const count = await Region.countDocuments({ name: { $in: [...unique] } });
          return count === unique.size;
        },
        message: 'serviceRegions must be unique and valid Thai provinces',
      },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

ProviderSchema.index({ serviceRegions: 1 });

ProviderSchema.virtual('cars', { ref: 'Car', localField: '_id', foreignField: 'provider' });
ProviderSchema.virtual('pickupLocations', { ref: 'PickupLocation', localField: '_id', foreignField: 'provider' });
ProviderSchema.virtual('bookings', { ref: 'Booking', localField: '_id', foreignField: 'provider' });

module.exports = mongoose.model('Provider', ProviderSchema);
