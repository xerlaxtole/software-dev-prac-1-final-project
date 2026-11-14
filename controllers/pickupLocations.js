const Region = require('../models/Region');
const PickupLocation = require('../models/PickupLocation');

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
