const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const Provider = require('../models/Provider');
const PickupLocation = require('../models/PickupLocation');
const PickupRequest = require('../models/PickupRequest');
const { toCsv } = require('../utils/csv');
const { canManage } = require('../middleware/auth');

const populateBooking = [
  { path: 'car', select: 'brand model licensePlate dailyRate' },
  { path: 'provider', select: 'name address tel' },
];

//Write access (update/delete): the booking's user or admin
const isSelfOrAdmin = (booking, user) => user.role === 'admin' || booking.user.toString() === user.id;

//Read access: also the owner of the booking's provider (works whether booking.provider is populated or not)
const canViewBooking = async (booking, user) => {
  if (isSelfOrAdmin(booking, user)) return true;
  if (user.role !== 'provider') return false;
  return canManage(await Provider.findById(booking.provider._id ?? booking.provider), user);
};

//@desc     Get bookings — user: own · provider: its provider's · admin: all
//@route    GET /api/v1/bookings
//@route    GET /api/v1/providers/:providerId/bookings
//@access   Private
exports.getBookings = async (req, res, next) => {
  try {
    const { providerId } = req.params;

    //At /providers/:providerId/bookings: 400 bad id · 404 missing (every role), like loadProvider
    let provider = null;
    if (providerId) {
      if (!mongoose.isValidObjectId(providerId)) {
        return res.status(400).json({ success: false, message: `Invalid provider id ${providerId}` });
      }
      provider = await Provider.findById(providerId);
      if (!provider) {
        return res.status(404).json({ success: false, message: `No provider with the id of ${providerId}` });
      }
    }

    let filter;
    if (req.user.role === 'admin') {
      filter = provider ? { provider: provider._id } : {};
    } else if (req.user.role === 'provider') {
      if (provider) {
        if (!canManage(provider, req.user)) {
          return res.status(403).json({ success: false, message: 'Not authorized to view these bookings' });
        }
        filter = { provider: provider._id };
      } else {
        //No provider profile yet → empty list
        const own = await Provider.findOne({ owner: req.user.id });
        filter = { provider: own ? own._id : null };
      }
    } else {
      //General users can see only their bookings
      filter = { user: req.user.id };
      if (provider) filter.provider = provider._id;
    }

    const bookings = await Booking.find(filter).populate(populateBooking);
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: 'Cannot find Booking' });
  }
};

//@desc     Get single booking
//@route    GET /api/v1/bookings/:id
//@access   Private (self, provider owner, admin)
exports.getBooking = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid booking id ${req.params.id}` });
    }
    const booking = await Booking.findById(req.params.id).populate(populateBooking);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
    if (!(await canViewBooking(booking, req.user))) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to view this booking` });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: 'Cannot find Booking' });
  }
};

//@desc     Add booking for a car (provider is copied from the car)
//@route    POST /api/v1/cars/:carId/bookings
//@access   Private (user only — route uses authorize('user'))
exports.addBooking = async (req, res, next) => {
  try {
    //The router is also mounted at /bookings and /providers/:providerId/bookings, where there is no carId
    if (!req.params.carId) {
      return res.status(400).json({ success: false, message: 'carId is required: POST /cars/:carId/bookings' });
    }
    if (!mongoose.isValidObjectId(req.params.carId)) {
      return res.status(400).json({ success: false, message: `Invalid car id ${req.params.carId}` });
    }
    const car = await Car.findById(req.params.carId);
    if (!car) {
      return res.status(404).json({ success: false, message: `No car with the id of ${req.params.carId}` });
    }

    //A user can only hold 3 bookings
    const existed = await Booking.countDocuments({ user: req.user.id });
    if (existed >= 3) {
      return res.status(400).json({
        success: false,
        message: `The user with ID ${req.user.id} has already made 3 bookings`,
      });
    }

    const { startDate, endDate, pickupLocation } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);

    //Same-day rental (start == end) is allowed, matching the model validator
    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    //Optional: without one, pick-up falls back to a pick-up request or the provider's address
    if (pickupLocation) {
      if (!mongoose.isValidObjectId(pickupLocation)) {
        return res.status(400).json({ success: false, message: 'Invalid pickupLocation id' });
      }
      if (!(await PickupLocation.exists({ _id: pickupLocation, provider: car.provider }))) {
        return res.status(400).json({ success: false, message: "pickupLocation does not belong to this car's provider" });
      }
    }

    //Inclusive overlap (start1 ≤ end2 && start2 ≤ end1), same rule as the car search in controllers/cars.js
    const conflict = await Booking.exists({ car: car._id, startDate: { $lte: end }, endDate: { $gte: start } });
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Car is already booked for these dates' });
    }

    const booking = await Booking.create({
      user: req.user.id,
      car: car._id,
      provider: car.provider,
      startDate: start,
      endDate: end,
      pickupLocation: pickupLocation || null,
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Update booking dates / pick-up location
//@route    PUT /api/v1/bookings/:id
//@access   Private (self, admin)
exports.updateBooking = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid booking id ${req.params.id}` });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
    if (!isSelfOrAdmin(booking, req.user)) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to update this booking` });
    }

    const body = req.body;

    const start = new Date(body.startDate ?? booking.startDate);
    const end = new Date(body.endDate ?? booking.endDate);
    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    let car = null;
    if (body.car !== undefined && String(body.car) !== String(booking.car)) {
      if (!mongoose.isValidObjectId(body.car)) {
        return res.status(400).json({ success: false, message: 'Invalid car id' });
      }
      car = await Car.findById(body.car);
      if (!car) {
        return res.status(404).json({ success: false, message: `No car with the id of ${body.car}` });
      }
    }
    const carId = car ? car._id : booking.car;
    const providerId = car ? car.provider : booking.provider;
    const providerChanged = String(providerId) !== String(booking.provider);

    let pickupLocation = booking.pickupLocation;
    if (body.pickupLocation !== undefined) pickupLocation = body.pickupLocation || null;
    else if (providerChanged) pickupLocation = null;
    if (body.pickupLocation) {
      if (!mongoose.isValidObjectId(body.pickupLocation)) {
        return res.status(400).json({ success: false, message: 'Invalid pickupLocation id' });
      }
      if (!(await PickupLocation.exists({ _id: body.pickupLocation, provider: providerId }))) {
        return res.status(400).json({ success: false, message: "pickupLocation does not belong to this car's provider" });
      }
    }

    if (car || start.getTime() !== booking.startDate.getTime() || end.getTime() !== booking.endDate.getTime()) {
      const conflict = await Booking.exists({
        _id: { $ne: booking._id },
        car: carId,
        startDate: { $lte: end },
        endDate: { $gte: start },
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Car is already booked for these dates' });
      }
    }

    let request = null;
    if (providerChanged) request = await PickupRequest.findOne({ booking: booking._id });
    else if (body.pickupLocation) request = await PickupRequest.findOne({ booking: booking._id, status: 'pending' });

    booking.car = carId;
    booking.provider = providerId;
    booking.startDate = start;
    booking.endDate = end;
    booking.pickupLocation = pickupLocation;
    if (request) booking.pickupRequest = null;

    await booking.save(); //save() runs the endDate ≥ startDate validator
    if (request) await request.deleteOne(); //only after the booking update succeeded

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Delete booking (+ its pick-up request)
//@route    DELETE /api/v1/bookings/:id
//@access   Private (self, admin)
exports.deleteBooking = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid booking id ${req.params.id}` });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
    if (!isSelfOrAdmin(booking, req.user)) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to delete this booking` });
    }

    await PickupRequest.deleteMany({ booking: booking._id });
    await booking.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const effectivePickup = (b) => {
  if (b.pickupLocation) return b.pickupLocation;
  if (b.pickupRequest?.status === 'approved') return b.pickupRequest;
  return b.provider ?? {};
};

//@desc     Download bookings as CSV — user: own · provider: its provider's · admin: all
//@route    GET /api/v1/bookings/export
//@access   Private                                                       req A1
exports.exportBookings = async (req, res, next) => {
  try {
    let filter;
    if (req.user.role === 'admin') {
      filter = {};
    } else if (req.user.role === 'provider') {
      //Same scope as getBookings: no provider profile yet → empty export
      const own = await Provider.findOne({ owner: req.user.id });
      filter = { provider: own ? own._id : null };
    } else {
      filter = { user: req.user.id };
    }

    const bookings = await Booking.find(filter)
      .populate([
        ...populateBooking,
        { path: 'pickupLocation', select: 'name address' },
        { path: 'pickupRequest', select: 'name address status' },
      ])
      .sort('startDate');

    const csv = toCsv(
      [
        'bookingId', 'startDate', 'endDate', 'carBrand', 'carModel', 'licensePlate',
        'providerName', 'providerTel', 'pickupName', 'pickupAddress', 'createdAt',
      ],
      bookings.map((b) => {
        const pickup = effectivePickup(b);
        return [
          b.id, b.startDate, b.endDate, b.car?.brand, b.car?.model, b.car?.licensePlate,
          b.provider?.name, b.provider?.tel, pickup.name, pickup.address, b.createdAt,
        ];
      })
    );
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename=bookings.csv');
    res.status(200).send(csv);
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Cannot export bookings' });
  }
};
