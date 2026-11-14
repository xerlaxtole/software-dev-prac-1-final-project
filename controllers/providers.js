const Provider = require('../models/Provider');
const Region = require('../models/Region');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const PickupLocation = require('../models/PickupLocation');
const PickupRequest = require('../models/PickupRequest');
const { canManage } = require('../middleware/auth');
const { toCsv } = require('../utils/csv');

const writeError = (res, err) =>
  err.code === 11000
    ? res.status(409).json({ success: false, message: 'A provider with this name already exists' })
    : res.status(400).json({ success: false, message: err.message });

//@desc     Get all providers — filter (?field[gt]=), ?region=, select, sort, page/limit
//@route    GET /api/v1/providers
//@access   Private
exports.getProviders = async (req, res, next) => {
  try {
    //Copy req.query, drop control params, turn gt/gte/lt/lte/in into Mongo operators
    const reqQuery = { ...req.query };
    ['select', 'sort', 'page', 'limit', 'region'].forEach((param) => delete reqQuery[param]);
    const filter = JSON.parse(JSON.stringify(reqQuery).replace(/\b(gt|gte|lt|lte|in)\b/g, (m) => `$${m}`));

    //Filter by region of service (req R2.1); unknown province → 400
    if (req.query.region) {
      if (!(await Region.exists({ name: req.query.region }))) {
        return res.status(400).json({ success: false, message: `Unknown region ${req.query.region}` });
      }
      filter.serviceRegions = req.query.region;
    }

    let query = Provider.find(filter);

    if (req.query.select) {
      query = query.select(req.query.select.split(',').join(' '));
    }
    query = query.sort(req.query.sort ? req.query.sort.split(',').join(' ') : '-createdAt');

    //Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const total = await Provider.countDocuments(filter);

    const providers = await query.skip(startIndex).limit(limit);

    const pagination = {};
    if (page * limit < total) pagination.next = { page: page + 1, limit };
    if (startIndex > 0) pagination.prev = { page: page - 1, limit };

    res.status(200).json({ success: true, count: providers.length, pagination, data: providers });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Get single provider
//@route    GET /api/v1/providers/:id
//@access   Private
exports.getProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: `No provider with the id of ${req.params.id}` });
    }
    res.status(200).json({ success: true, data: provider });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Create provider (a provider account creates its own, one only; admin passes `owner`)
//@route    POST /api/v1/providers
//@access   Private (admin, provider)
exports.createProvider = async (req, res, next) => {
  try {
    if (req.user.role === 'provider') {
      if (await Provider.exists({ owner: req.user.id })) {
        return res.status(409).json({ success: false, message: 'This account already owns a provider' });
      }
      req.body.owner = req.user.id;
    }

    const provider = await Provider.create(req.body);
    res.status(201).json({ success: true, data: provider });
  } catch (err) {
    writeError(res, err);
  }
};

//@desc     Update provider name / address / tel
//@route    PUT /api/v1/providers/:id
//@access   Private (owner, admin)
exports.updateProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: `No provider with the id of ${req.params.id}` });
    }
    if (!canManage(provider, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this provider' });
    }

    //Whitelist: owner and serviceRegions can't be changed here (regions have their own endpoints)
    for (const field of ['name', 'address', 'tel']) {
      if (req.body[field] !== undefined) provider[field] = req.body[field];
    }
    await provider.save();

    res.status(200).json({ success: true, data: provider });
  } catch (err) {
    writeError(res, err);
  }
};

//@desc     Delete provider + its cars, pick-up locations, pick-up requests, bookings
//@route    DELETE /api/v1/providers/:id
//@access   Private (owner, admin)
exports.deleteProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: `No provider with the id of ${req.params.id}` });
    }
    if (!canManage(provider, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this provider' });
    }

    const byProvider = { provider: provider._id };
    await Promise.all([
      Booking.deleteMany(byProvider),
      PickupRequest.deleteMany(byProvider),
      PickupLocation.deleteMany(byProvider),
      Car.deleteMany(byProvider),
    ]);
    await provider.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Download the provider list as CSV
//@route    GET /api/v1/providers/export
//@access   Private                                                       req A2
exports.exportProviders = async (req, res, next) => {
  try {
    const providers = await Provider.find().sort('name');
    const csv = toCsv(
      ['name', 'address', 'tel', 'serviceRegions'],
      providers.map((p) => [p.name, p.address, p.tel, p.serviceRegions.join('; ')])
    );
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename=providers.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Cannot export providers' });
  }
};
