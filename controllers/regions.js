const Region = require('../models/Region');
const PickupLocation = require('../models/PickupLocation');

//Body must be { regions: [province names] }; returns the list or null
const regionsFromBody = (body, allowEmpty) => {
  const list = body?.regions;
  if (!Array.isArray(list) || !list.every((r) => typeof r === 'string')) return null;
  return allowEmpty || list.length ? list : null;
};
const badBody = (res) =>
  res.status(400).json({ success: false, message: 'Body must be { "regions": ["Bangkok", ...] }' });

//@desc     Master list of the 77 Thai provinces
//@route    GET /api/v1/regions
//@access   Public
exports.getRegions = async (req, res, next) => {
  try {
    const regions = await Region.find().sort('name').select('name nameTh -_id');
    res.status(200).json({ success: true, count: regions.length, data: regions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Cannot find Regions' });
  }
};

//All handlers below run after loadProvider(), so req.provider is set (and owned, where required)

//@desc     View a provider's service regions
//@route    GET /api/v1/providers/:providerId/regions
//@access   Private                                                       req R1.2
exports.getProviderRegions = async (req, res, next) => {
  res.status(200).json({ success: true, count: req.provider.serviceRegions.length, data: req.provider.serviceRegions });
};

//@desc     Add service regions  { regions: ["Bangkok", "Chonburi"] }
//@route    POST /api/v1/providers/:providerId/regions
//@access   Private (owner, admin)                                        req R1.1
exports.addProviderRegions = async (req, res, next) => {
  try {
    const regions = regionsFromBody(req.body, false);
    if (!regions) return badBody(res);

    const provider = req.provider;
    provider.serviceRegions = [...new Set([...provider.serviceRegions, ...regions])];
    await provider.save(); //model validator rejects unknown provinces → 400

    res.status(200).json({ success: true, count: provider.serviceRegions.length, data: provider.serviceRegions });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Replace the whole set of service regions (add + remove in one call)
//@route    PUT /api/v1/providers/:providerId/regions
//@access   Private (owner, admin)                                        req R1.3
exports.replaceProviderRegions = async (req, res, next) => {
  try {
    const regions = regionsFromBody(req.body, true);
    if (!regions) return badBody(res);

    const provider = req.provider;
    const wanted = new Set(regions);
    const dropped = provider.serviceRegions.filter((r) => !wanted.has(r));
    const inUse = await PickupLocation.distinct('region', { provider: provider._id, region: { $in: dropped } });
    if (inUse.length) {
      return res.status(409).json({ success: false, message: `Still used by pick-up locations: ${inUse.join(', ')}` });
    }

    provider.serviceRegions = [...wanted];
    await provider.save();
    res.status(200).json({ success: true, count: provider.serviceRegions.length, data: provider.serviceRegions });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//@desc     Remove one service region (409 while a pick-up location uses it)
//@route    DELETE /api/v1/providers/:providerId/regions/:region
//@access   Private (owner, admin)                                        req R1.3, R1.4
exports.removeProviderRegion = async (req, res, next) => {
  try {
    const provider = req.provider;
    const { region } = req.params;

    if (!provider.serviceRegions.includes(region)) {
      return res.status(404).json({ success: false, message: `${region} is not one of this provider's regions` });
    }
    if (await PickupLocation.exists({ provider: provider._id, region })) {
      return res.status(409).json({ success: false, message: `${region} is still used by a pick-up location` });
    }

    provider.serviceRegions = provider.serviceRegions.filter((r) => r !== region);
    await provider.save();
    res.status(200).json({ success: true, count: provider.serviceRegions.length, data: provider.serviceRegions });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
