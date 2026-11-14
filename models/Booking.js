const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true, index: true },
    car: { type: mongoose.Schema.ObjectId, ref: 'Car', required: true },
    provider: { type: mongoose.Schema.ObjectId, ref: 'Provider', required: true }, // copied from car.provider on create
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pickupLocation: { type: mongoose.Schema.ObjectId, ref: 'PickupLocation', default: null },
    pickupRequest: { type: mongoose.Schema.ObjectId, ref: 'PickupRequest', default: null },
  },
  { timestamps: true }
);

// Overlap queries hit (car + dates). Max-3 and the overlap check live in the controller.
BookingSchema.index({ car: 1, startDate: 1, endDate: 1 });

BookingSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error('endDate must be on or after startDate'));
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
