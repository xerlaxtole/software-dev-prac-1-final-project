const Car = require('../models/Car');
const Provider = require('../models/Provider');
const Region = require('../models/Region');
const Booking = require('../models/Booking');
const PickupRequest = require('../models/PickupRequest');
const { canManage } = require('../middleware/auth');

const writeError = (res, err) =>
  err.code === 11000
    ? res.status(409).json({ success: false, message: 'A car with this licensePlate already exists' })
    : res.status(400).json({ success: false, message: err.message });

//@desc     Search cars — ?provider= ?type= ?region= ?start=&end= (only cars free for the whole range), page/limit
//@route    GET /api/v1/cars
//@route    GET /api/v1/providers/:providerId/cars
//@access   Private                                                       req 3, R2.1
exports.getCars = async (req, res, next) => {
  try {
    const filter = {};
    const providerId = req.params.providerId || req.query.provider;
    if (providerId) filter.provider = providerId;
    if (req.query.type) filter.type = req.query.type;

    //Region of service: cars whose provider serves that province
    if (req.query.region) {
      if (!(await Region.exists({ name: req.query.region }))) {
        return res.status(400).json({ success: false, message: `Unknown region ${req.query.region}` });
      }
      const ids = await Provider.distinct('_id', {
        serviceRegions: req.query.region,
        ...(providerId && { _id: providerId }),
      });
      filter.provider = { $in: ids };
    }

    //Availability: drop cars with any booking overlapping [start, end]
    if (req.query.start || req.query.end) {
      const start = new Date(req.query.start);
      const end = new Date(req.query.end);
      if (isNaN(start) || isNaN(end) || end < start) {
        return res.status(400).json({ success: false, message: 'start and end must both be dates, with end ≥ start' });
      }
      const busy = await Booking.distinct('car', { startDate: { $lte: end }, endDate: { $gte: start } });
      filter._id = { $nin: busy };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const total = await Car.countDocuments(filter);
    const cars = await Car.find(filter)
      .populate({ path: 'provider', select: 'name tel serviceRegions' })
      .sort('dailyRate')
      .skip((page - 1) * limit)
      .limit(limit);

    const pagination = {};
    if (page * limit < total) pagination.next = { page: page + 1, limit };
    if (page > 1) pagination.prev = { page: page - 1, limit };

    res.status(200).json({ success: true, count: cars.length, pagination, data: cars });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Get single car (with its provider)
//@route    GET /api/v1/cars/:id
//@access   Private                                                       req 3
exports.getCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id).populate({ path: 'provider', select: 'name address tel serviceRegions' });
    if (!car) {
      return res.status(404).json({ success: false, message: `No car with the id of ${req.params.id}` });
    }
    res.status(200).json({ success: true, data: car });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Add a car to a provider (runs after loadProvider(true))
//@route    POST /api/v1/providers/:providerId/cars
//@access   Private (owner, admin)
exports.createCar = async (req, res, next) => {
  try {
    const { brand, model, licensePlate, type, seats, dailyRate } = req.body;
    const car = await Car.create({ provider: req.provider._id, brand, model, licensePlate, type, seats, dailyRate });
    res.status(201).json({ success: true, data: car });
  } catch (err) {
    writeError(res, err);
  }
};

//Load :id with its provider and check ownership; sends the error and returns null on failure
const loadOwnedCar = async (req, res) => {
  const car = await Car.findById(req.params.id).populate('provider');
  if (!car) {
    res.status(404).json({ success: false, message: `No car with the id of ${req.params.id}` });
    return null;
  }
  if (!canManage(car.provider, req.user)) {
    res.status(403).json({ success: false, message: 'Not authorized to manage this car' });
    return null;
  }
  return car;
};

//@desc     Update a car (provider can't be changed)
//@route    PUT /api/v1/cars/:id
//@access   Private (owner, admin)
exports.updateCar = async (req, res, next) => {
  try {
    const car = await loadOwnedCar(req, res);
    if (!car) return;

    for (const field of ['brand', 'model', 'licensePlate', 'type', 'seats', 'dailyRate']) {
      if (req.body[field] !== undefined) car[field] = req.body[field];
    }
    await car.save();
    res.status(200).json({ success: true, data: car });
  } catch (err) {
    writeError(res, err);
  }
};

//@desc     Delete a car (409 while it has a current/upcoming booking; past bookings go with it)
//@route    DELETE /api/v1/cars/:id
//@access   Private (owner, admin)
exports.deleteCar = async (req, res, next) => {
  try {
    const car = await loadOwnedCar(req, res);
    if (!car) return;

    if (await Booking.exists({ car: car._id, endDate: { $gte: new Date() } })) {
      return res.status(409).json({ success: false, message: 'This car has current or upcoming bookings' });
    }

    const pastBookings = await Booking.distinct('_id', { car: car._id });
    await PickupRequest.deleteMany({ booking: { $in: pastBookings } });
    await Booking.deleteMany({ car: car._id });
    await car.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
