const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const PickupRequest = require('../models/PickupRequest');

//@desc     Request a custom pick-up address for a booking { name, address, region? } (replaces a rejected one)
//@route    POST /api/v1/bookings/:bookingId/pickup-request
//@access   Private (booking's user)                                      req P3.6
exports.createPickupRequest = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: `Invalid booking id ${bookingId}` });
    }
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${bookingId}` });
    }
    if (booking.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to request a pick-up for this booking` });
    }

    //Nothing to pick up once the rental is over
    if (booking.endDate < new Date()) {
      return res.status(400).json({ success: false, message: 'This booking has already ended' });
    }

    const { name, address, region } = req.body;

    //region is optional; if given it must be one the booking's provider serves
    if (region !== undefined) {
      const provider = await Provider.findById(booking.provider);
      if (!provider?.serviceRegions.includes(region)) {
        return res.status(400).json({
          success: false,
          message: `region must be one of this provider's service regions: ${provider?.serviceRegions.join(', ') || '(none yet)'}`,
        });
      }
    }

    //One request per booking: a pending/approved one blocks, a rejected one gets replaced
    const existing = await PickupRequest.findOne({ booking: booking._id });
    if (existing && existing.status !== 'rejected') {
      return res.status(409).json({ success: false, message: `This booking already has a ${existing.status} pick-up request` });
    }

    //user/provider come from the booking, never the body
    const request = new PickupRequest({ booking: booking._id, user: booking.user, provider: booking.provider, name, address, region });
    await request.validate(); //a bad body fails here, before the rejected request is removed

    if (existing) await existing.deleteOne(); //unique index on booking: remove the rejected one first
    await request.save();

    booking.pickupRequest = request._id;
    await booking.save();

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
