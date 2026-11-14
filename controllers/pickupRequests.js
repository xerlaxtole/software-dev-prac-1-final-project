const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const PickupRequest = require('../models/PickupRequest');
const PickupLocation = require('../models/PickupLocation');
const { canManage } = require('../middleware/auth');

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

//@desc     See a booking's pick-up request and its status
//@route    GET /api/v1/bookings/:bookingId/pickup-request
//@access   Private (booking's user, its provider's owner, admin)        req P3.6
exports.getPickupRequest = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: `Invalid booking id ${bookingId}` });
    }
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${bookingId}` });
    }

    //Same access as viewing the booking itself
    const allowed =
      req.user.role === 'admin' ||
      booking.user.toString() === req.user.id ||
      (req.user.role === 'provider' && canManage(await Provider.findById(booking.provider), req.user));
    if (!allowed) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to view this pick-up request` });
    }

    const request = await PickupRequest.findOne({ booking: booking._id });
    if (!request) {
      return res.status(404).json({ success: false, message: `No pick-up request for booking ${bookingId}` });
    }

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Cannot find pick-up request' });
  }
};

//@desc     Cancel a booking's pick-up request (only while pending)
//@route    DELETE /api/v1/bookings/:bookingId/pickup-request
//@access   Private (booking's user)                                      req P3.6
exports.cancelPickupRequest = async (req, res, next) => {
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
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to cancel this pick-up request` });
    }

    const request = await PickupRequest.findOne({ booking: booking._id });
    if (!request) {
      return res.status(404).json({ success: false, message: `No pick-up request for booking ${bookingId}` });
    }
    //Once the provider has decided, the request is part of the record
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: `Only a pending request can be cancelled (this one is ${request.status})` });
    }

    //Unlink the booking first, so it never points at a deleted request
    booking.pickupRequest = null;
    await booking.save();
    await request.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     List a provider's pick-up requests — ?status=pending (default) | approved | rejected
//@route    GET /api/v1/providers/:providerId/pickup-requests
//@access   Private (provider owner, admin)                               req P3.7
exports.getPickupRequests = async (req, res, next) => {
  try {
    //loadProvider(true) already answered 400/404/403 and set req.provider
    const status = req.query.status || 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be pending, approved or rejected' });
    }

    const requests = await PickupRequest.find({ provider: req.provider._id, status })
      .populate({ path: 'booking', select: 'startDate endDate car' })
      .populate({ path: 'user', select: 'name tel email' })
      .sort('createdAt'); //oldest first: the order to review them in
    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Cannot find pick-up requests' });
  }
};

//@desc     Approve a pending request { addToList?: true } — addToList also saves it as a pick-up location
//@route    PUT /api/v1/pickup-requests/:id/approve
//@access   Private (provider owner, admin)                               req P3.8
exports.approvePickupRequest = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid pick-up request id ${req.params.id}` });
    }
    const request = await PickupRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: `No pick-up request with the id of ${req.params.id}` });
    }

    //No :providerId in this URL, so check ownership through the request's provider
    const provider = await Provider.findById(request.provider);
    if (!canManage(provider, req.user)) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to review this pick-up request` });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: `Only a pending request can be approved (this one is ${request.status})` });
    }

    //addToList: create the location first, so if it fails the request stays pending
    if (req.body.addToList === true) {
      if (!provider.serviceRegions.includes(request.region)) {
        return res.status(400).json({
          success: false,
          message: `To add it to the list, the request's region must be one of this provider's service regions: ${provider.serviceRegions.join(', ') || '(none yet)'}`,
        });
      }
      if (await PickupLocation.exists({ provider: provider._id, name: request.name.trim() })) {
        return res.status(409).json({ success: false, message: `This provider already has a pick-up location named ${request.name.trim()}` });
      }
      await PickupLocation.create({ provider: provider._id, name: request.name, address: request.address, region: request.region });
    }

    request.status = 'approved';
    request.reviewedAt = new Date();
    await request.save();

    //The approved address replaces the booking's chosen location (location has priority otherwise)
    await Booking.updateOne({ _id: request.booking }, { pickupLocation: null });

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
