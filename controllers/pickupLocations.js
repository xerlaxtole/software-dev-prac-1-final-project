const mongoose = require('mongoose');
const Provider = require('../models/Provider');
const Region = require('../models/Region');
const PickupLocation = require('../models/PickupLocation');
const { canManage } = require('../middleware/auth');

//@desc     List a provider's pick-up locations — ?region= filters by province
//@route    GET /api/v1/providers/:providerId/pickup-locations
//@access   Private
exports.getPickupLocations = async (req, res, next) => {
  try {
    const filter = { provider: req.provider._id };

    if (req.query.region) {
      if (!(await Region.exists({ name: req.query.region }))) {
        return res.status(400).json({ success: false, message: `Unknown region ${req.query.region}` });
      }
      filter.region = req.query.region;
    }

    const locations = await PickupLocation.find(filter)
      .populate({ path: 'provider', select: 'name tel' })
      .sort('name');
    res.status(200).json({ success: true, count: locations.length, data: locations });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Cannot find pick-up locations' });
  }
};

//@desc     Add a pick-up location { name, address, region }
//@route    POST /api/v1/providers/:providerId/pickup-locations
//@access   Private (provider owner, admin)
exports.addPickupLocation = async (req, res, next) => {
  try {
    const { name, address, region } = req.body;

    if (!req.provider.serviceRegions.includes(region)) {
      return res.status(400).json({
        success: false,
        message: `region must be one of this provider's service regions: ${req.provider.serviceRegions.join(', ') || '(none yet)'}`,
      });
    }

    if (typeof name === 'string' && (await PickupLocation.exists({ provider: req.provider._id, name: name.trim() }))) {
      return res.status(409).json({ success: false, message: `This provider already has a pick-up location named ${name.trim()}` });
    }

    const location = await PickupLocation.create({ provider: req.provider._id, name, address, region });
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Get one pick-up location (with its provider)
//@route    GET /api/v1/pickup-locations/:id
//@access   Private
exports.getPickupLocation = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid pick-up location id ${req.params.id}` });
    }

    const location = await PickupLocation.findById(req.params.id).populate({ path: 'provider', select: 'name address tel' });

    if (!location || (req.params.providerId && location.provider?.id !== req.params.providerId)) {
      return res.status(404).json({ success: false, message: `No pick-up location with the id of ${req.params.id}` });
    }

    res.status(200).json({ success: true, data: location });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Cannot find pick-up location' });
  }
};

//@desc     Update a pick-up location { name?, address?, region? }
//@route    PUT /api/v1/pickup-locations/:id
//@access   Private (provider owner, admin)
exports.updatePickupLocation = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: `Invalid pick-up location id ${req.params.id}` });
    }

    const location = await PickupLocation.findById(req.params.id);
    if (!location || (req.params.providerId && location.provider.toString() !== req.params.providerId)) {
      return res.status(404).json({ success: false, message: `No pick-up location with the id of ${req.params.id}` });
    }

    const provider = await Provider.findById(location.provider);
    if (!canManage(provider, req.user)) {
      return res.status(403).json({ success: false, message: `User ${req.user.id} is not authorized to update this pick-up location` });
    }

    const { name, address, region } = req.body;

    if (region !== undefined && !provider.serviceRegions.includes(region)) {
      return res.status(400).json({
        success: false,
        message: `region must be one of this provider's service regions: ${provider.serviceRegions.join(', ') || '(none yet)'}`,
      });
    }

    if (typeof name === 'string' && name.trim() !== location.name) {
      const taken = await PickupLocation.exists({ _id: { $ne: location._id }, provider: location.provider, name: name.trim() });
      if (taken) {
        return res.status(409).json({ success: false, message: `This provider already has a pick-up location named ${name.trim()}` });
      }
    }

    if (name !== undefined) location.name = name;
    if (address !== undefined) location.address = address;
    if (region !== undefined) location.region = region;

    await location.save(); //runs required/trim validators, so an empty name/address is a 400
    res.status(200).json({ success: true, data: location });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
