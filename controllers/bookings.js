const Booking = require('../models/Booking');
const Car = require('../models/Car');
const Provider = require('../models/Provider');
const PickupRequest = require('../models/PickupRequest');
const { toCsv } = require('../utils/csv');

const populateBooking = [
  { path: 'car', select: 'brand model licensePlate dailyRate' },
  { path: 'provider', select: 'name address tel' },
];

const isSelfOrAdmin = (booking, user) => user.role === 'admin' || booking.user.toString() === user.id;

//@desc     Get bookings — user: own · provider: its provider's · admin: all
//@route    GET /api/v1/bookings
//@route    GET /api/v1/providers/:providerId/bookings
//@access   Private
exports.getBookings = async (req, res, next) => {
  try {
    let filter;

    if (req.user.role === 'admin') {
      filter = req.params.providerId ? { provider: req.params.providerId } : {};
    } else if (req.user.role === 'provider') {
      const own = await Provider.findOne({ owner: req.user.id });
      if (req.params.providerId && (!own || own.id !== req.params.providerId)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view these bookings' });
      }
      filter = { provider: own ? own._id : null };
    } else {
      //General users can see only their bookings
      filter = { user: req.user.id };
      if (req.params.providerId) filter.provider = req.params.providerId;
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
//@access   Private (self, admin)
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(populateBooking);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
    if (!isSelfOrAdmin(booking, req.user)) {
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

    if (isNaN(start) || isNaN(end) || start >= end) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const conflict = await Booking.findOne({
      car: req.params.carId,
      startDate: { $lt: end },
      endDate:   { $gt: start },
    });

    if (conflict) {
      return res.status(409).json({ message: 'Car is already booked for these dates' });
    }

    if (!pickupLocation) {
      return res.status(400).json({ success: false, message: 'pickupLocation is required' });
    }

    if (!mongoose.isValidObjectId(pickupLocation)) {
      return res.status(400).json({ success: false, message: 'Invalid pickupLocation id' });
    }

    const validLocation = await PickupLocation.exists({
      _id: pickupLocation,
      provider: car.provider,
    });

    if (!validLocation) {
      return res.status(400).json({
        success: false,
        message: 'pickupLocation does not belong to this car\'s provider',
      });
    }

    const booking = await Booking.create({
      user: req.user.id,
      car: car._id,
      provider: car.provider,
      startDate: start,
      endDate: end,
      pickupLocation: pickupLocation,
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
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking with the id of ${req.params.id}` });
    }
    if (!isSelfOrAdmin(booking, req.user)) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to update this booking` });
    }

    const oldProvider = String(booking.provider);

    if (req.body.car !== undefined && String(req.body.car) !== String(booking.car)) {
      if (!mongoose.isValidObjectId(req.body.car)) {
        return res.status(400).json({ success: false, message: 'Invalid car id' });
      }
      const car = await Car.findById(req.body.car);
      if (!car) {
        return res.status(404).json({ success: false, message: `No car with the id of ${req.body.car}` });
      }
      booking.car = car._id;
      booking.provider = car.provider;
    }

    for (const field of ['startDate', 'endDate', 'pickupLocation']) {
      if (req.body[field] !== undefined) booking[field] = req.body[field];
    }

    const start = new Date(booking.startDate);
    const end = new Date(booking.endDate);
    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    if (booking.pickupLocation && booking.isModified(['pickupLocation', 'provider'])) {
      if (!mongoose.isValidObjectId(booking.pickupLocation)) {
        return res.status(400).json({ success: false, message: 'Invalid pickupLocation id' });
      }
      const validLocation = await PickupLocation.exists({
        _id: booking.pickupLocation,
        provider: booking.provider,
      });
      if (!validLocation) {
        return res.status(400).json({
          success: false,
          message: 'pickupLocation does not belong to this car\'s provider',
        });
      }
    }

    if (booking.isModified(['startDate', 'endDate', 'car'])) {
      const conflict = await Booking.exists({
        _id: { $ne: booking._id },
        car: booking.car,
        startDate: { $lt: end },
        endDate: { $gt: start },
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Car is already booked for these dates' });
      }
    }

    await booking.save(); //save() runs the endDate ≥ startDate validator

    if (String(booking.provider) !== oldProvider) {
      await PickupRequest.deleteOne({ booking: booking._id });
    }

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
