//Offline smoke check (no DB): models are stubbed where the controllers touch the database.
//Run: npm run check
const assert = require('node:assert');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const { authorize, canManage, loadProvider } = require('../middleware/auth');
const { addBooking, updateBooking, getBooking, getBookings, deleteBooking } = require('../controllers/bookings');
const PickupRequest = require('../models/PickupRequest');
const Provider = require('../models/Provider');
const PickupLocation = require('../models/PickupLocation');
const { deleteMe } = require('../controllers/auth');
const { removeProviderRegion } = require('../controllers/regions');
const { deleteCar } = require('../controllers/cars');
const { toCsv } = require('../utils/csv');
const Region = require('../models/Region');
const { getPickupLocations } = require('../controllers/pickupLocations');

const id = () => new mongoose.Types.ObjectId();
const mockRes = () => {
  const r = {};
  r.status = (code) => ((r.code = code), r);
  r.json = (body) => ((r.body = body), r);
  return r;
};

(async () => {
  //authorize(): blocks unlisted roles, lets listed ones through
  const blocked = mockRes();
  authorize('user')({ user: { role: 'admin' } }, blocked, () => assert.fail('admin must not rent'));
  assert.equal(blocked.code, 403);
  let passed = false;
  authorize('user')({ user: { role: 'user' } }, mockRes(), () => (passed = true));
  assert.ok(passed);

  //canManage(): owner provider or admin only
  const ownerId = id();
  const provider = { owner: ownerId };
  assert.ok(canManage(provider, { role: 'provider', id: ownerId.toString() }));
  assert.ok(!canManage(provider, { role: 'provider', id: id().toString() }));
  assert.ok(canManage(provider, { role: 'admin', id: 'x' }));

  //Booking model: endDate before startDate is a ValidationError
  const bad = new Booking({ user: id(), car: id(), provider: id(), startDate: '2026-12-20', endDate: '2026-12-18' });
  await assert.rejects(bad.validate(), (e) => e.name === 'ValidationError' && /endDate/.test(e.message));

  //addBooking(): 400 no/bad carId · 404 unknown car · 400 at 3 bookings · 201 copies provider from the car
  const req = { params: { carId: id().toString() }, user: { id: 'u1' }, body: { startDate: '2026-12-20', endDate: '2026-12-23' } };

  let res = mockRes();
  await addBooking({ ...req, params: {} }, res); //POST /bookings has no carId
  assert.equal(res.code, 400);
  res = mockRes();
  await addBooking({ ...req, params: { carId: 'c1' } }, res);
  assert.equal(res.code, 400);

  Car.findById = async () => null;
  res = mockRes();
  await addBooking(req, res);
  assert.equal(res.code, 404);

  const carProvider = id();
  Car.findById = async () => ({ _id: id(), provider: carProvider });
  Booking.countDocuments = async () => 3;
  res = mockRes();
  await addBooking(req, res);
  assert.equal(res.code, 400);

  Booking.countDocuments = async () => 2;
  Booking.create = async (doc) => doc;
  Booking.exists = async () => null;
  res = mockRes();
  await addBooking(req, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.provider, carProvider);
  assert.equal(res.body.data.pickupLocation, null); //pickupLocation is optional

  //addBooking(): 400 bad/reversed dates · 409 overlap · pickupLocation must be the car provider's
  res = mockRes();
  await addBooking({ ...req, body: { startDate: '2026-12-23', endDate: '2026-12-20' } }, res);
  assert.equal(res.code, 400);
  res = mockRes();
  await addBooking({ ...req, body: { startDate: 'nope', endDate: '2026-12-20' } }, res);
  assert.equal(res.code, 400);

  let overlapQuery;
  Booking.exists = async (q) => ((overlapQuery = q), { _id: id() });
  res = mockRes();
  await addBooking(req, res);
  assert.equal(res.code, 409);
  assert.equal(res.body.success, false);
  assert.ok(overlapQuery.startDate.$lte && overlapQuery.endDate.$gte); //inclusive, like the car search
  Booking.exists = async () => null;

  res = mockRes();
  await addBooking({ ...req, body: { ...req.body, pickupLocation: 'not-an-id' } }, res);
  assert.equal(res.code, 400);
  PickupLocation.exists = async () => null; //location of another provider
  res = mockRes();
  await addBooking({ ...req, body: { ...req.body, pickupLocation: id().toString() } }, res);
  assert.equal(res.code, 400);
  PickupLocation.exists = async () => ({ _id: id() });
  const loc = id().toString();
  res = mockRes();
  await addBooking({ ...req, body: { ...req.body, pickupLocation: loc } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.pickupLocation, loc);

  //updateBooking(): real Booking doc with save() stubbed
  const owner = id();
  const oldProv = id();
  const oldLoc = id();
  const freshBooking = () => {
    const b = new Booking({
      user: owner, car: id(), provider: oldProv, pickupLocation: oldLoc, pickupRequest: id(),
      startDate: '2026-12-20', endDate: '2026-12-23',
    });
    b.save = async () => b;
    Booking.findById = async () => b;
    return b;
  };
  const upd = (body, user = { role: 'user', id: owner.toString() }) => ({ params: { id: id().toString() }, user, body });
  let dropped;
  PickupRequest.findOne = async (q) => ({ q, deleteOne: async () => (dropped = q) });

  //403 for someone else's booking · 400 reversed dates
  freshBooking();
  res = mockRes();
  await updateBooking(upd({}, { role: 'user', id: id().toString() }), res);
  assert.equal(res.code, 403);
  res = mockRes();
  await updateBooking(upd({ endDate: '2026-12-01' }), res);
  assert.equal(res.code, 400);

  //409 on overlap, inclusive and excluding itself
  let b = freshBooking();
  Booking.exists = async (q) => ((overlapQuery = q), { _id: id() });
  res = mockRes();
  await updateBooking(upd({ endDate: '2026-12-25' }), res);
  assert.equal(res.code, 409);
  assert.equal(overlapQuery._id.$ne, b._id);
  assert.ok(overlapQuery.startDate.$lte && overlapQuery.endDate.$gte);
  Booking.exists = async () => null;

  //Changing car to another provider: provider re-copied, old location cleared, any request dropped
  b = freshBooking();
  const newProv = id();
  Car.findById = async () => ({ _id: id(), provider: newProv });
  dropped = null;
  res = mockRes();
  await updateBooking(upd({ car: id().toString() }), res);
  assert.equal(res.code, 200);
  assert.equal(String(b.provider), String(newProv));
  assert.equal(b.pickupLocation, null);
  assert.equal(b.pickupRequest, null);
  assert.deepEqual(dropped, { booking: b._id });

  //Picking a location: must be the provider's · cancels only a pending request
  freshBooking();
  PickupLocation.exists = async () => null;
  res = mockRes();
  await updateBooking(upd({ pickupLocation: id().toString() }), res);
  assert.equal(res.code, 400);
  b = freshBooking();
  PickupLocation.exists = async () => ({ _id: id() });
  dropped = null;
  res = mockRes();
  await updateBooking(upd({ pickupLocation: id().toString() }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(dropped, { booking: b._id, status: 'pending' });

  //Dates-only edit leaves pick-up untouched and skips the request lookup
  b = freshBooking();
  dropped = null;
  res = mockRes();
  await updateBooking(upd({ startDate: '2026-12-21' }), res);
  assert.equal(res.code, 200);
  assert.equal(String(b.pickupLocation), String(oldLoc));
  assert.equal(dropped, null);

  //Malformed booking id → 400 on update/delete (not a raw CastError)
  res = mockRes();
  await updateBooking({ ...upd({}), params: { id: 'abc' } }, res);
  assert.equal(res.code, 400);
  res = mockRes();
  await deleteBooking({ ...upd({}), params: { id: 'abc' } }, res);
  assert.equal(res.code, 400);

  //getBooking(): 400 bad id · booking's user, its provider's owner and admin may view; others 403
  const provOwner = id();
  const ownProv = { _id: id(), owner: provOwner };
  const shown = { user: owner, provider: { _id: ownProv._id, name: 'P' } }; //provider populated
  Booking.findById = () => ({ populate: async () => shown });
  Provider.findById = async () => ownProv;
  const view = async (user, bookingId = id().toString()) => {
    const r = mockRes();
    await getBooking({ params: { id: bookingId }, user }, r);
    return r.code;
  };
  assert.equal(await view({ role: 'user', id: owner.toString() }, 'abc'), 400);
  assert.equal(await view({ role: 'user', id: owner.toString() }), 200);
  assert.equal(await view({ role: 'user', id: id().toString() }), 403);
  assert.equal(await view({ role: 'provider', id: provOwner.toString() }), 200);
  assert.equal(await view({ role: 'provider', id: id().toString() }), 403);
  assert.equal(await view({ role: 'admin', id: 'a1' }), 200);

  //getBookings() at /providers/:providerId/bookings: 400 bad id · 404 missing · 403 other provider · own → filter
  let listFilter;
  Booking.find = (f) => ((listFilter = f), { populate: async () => [] });
  const list = async (user, providerId) => {
    const r = mockRes();
    await getBookings({ params: providerId ? { providerId } : {}, user }, r);
    return r.code;
  };
  const provUser = { role: 'provider', id: provOwner.toString() };
  assert.equal(await list(provUser, 'abc'), 400);
  Provider.findById = async () => null;
  assert.equal(await list({ role: 'admin', id: 'a1' }, id().toString()), 404);
  Provider.findById = async () => ownProv;
  assert.equal(await list({ role: 'provider', id: id().toString() }, ownProv._id.toString()), 403);
  assert.equal(await list(provUser, ownProv._id.toString()), 200);
  assert.deepEqual(listFilter, { provider: ownProv._id });
  assert.equal(await list({ role: 'user', id: owner.toString() }, ownProv._id.toString()), 200);
  assert.deepEqual(listFilter, { user: owner.toString(), provider: ownProv._id });
  Provider.findOne = async () => null; //provider account without a provider profile
  assert.equal(await list(provUser), 200);
  assert.deepEqual(listFilter, { provider: null });

  //toCsv(): BOM, quoting, and formula neutralising
  const csv = toCsv(['name', 'note'], [['Cars, Inc.', '=HYPERLINK("x")'], ['ไทย', 'say "hi"']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"Cars, Inc."'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"say ""hi"""'));

  //deleteMe(): a provider account that still owns a provider → 409
  Provider.exists = async () => true;
  res = mockRes();
  await deleteMe({ user: { _id: id() } }, res);
  assert.equal(res.code, 409);

  //removeProviderRegion(): 404 if not served · 409 while a pick-up location uses it · 200 removes it
  const prov = { _id: id(), serviceRegions: ['Bangkok', 'Chonburi'], save: async () => {} };
  res = mockRes();
  await removeProviderRegion({ provider: prov, params: { region: 'Phuket' } }, res);
  assert.equal(res.code, 404);
  PickupLocation.exists = async () => true;
  res = mockRes();
  await removeProviderRegion({ provider: prov, params: { region: 'Chonburi' } }, res);
  assert.equal(res.code, 409);
  PickupLocation.exists = async () => null;
  res = mockRes();
  await removeProviderRegion({ provider: prov, params: { region: 'Chonburi' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(prov.serviceRegions, ['Bangkok']);

  //deleteCar(): 409 while the car has a current/upcoming booking
  Car.findById = () => ({ populate: async () => ({ _id: id(), provider: { owner: id() } }) });
  Booking.exists = async () => true;
  res = mockRes();
  await deleteCar({ params: { id: 'c1' }, user: { role: 'admin', id: 'a1' } }, res);
  assert.equal(res.code, 409);

  //GET /pickup-locations (no :providerId) is stopped by loadProvider(false) → 404, so there is no all-providers list
  Provider.findById = async () => null;
  res = mockRes();
  await loadProvider(false)({ params: {}, user: { role: 'user', id: 'u1' } }, res, () => assert.fail('must not list'));
  assert.equal(res.code, 404);

  //getPickupLocations() (after loadProvider): 400 unknown region · filters by provider + region
  let locFilter;
  PickupLocation.find = (f) => ((locFilter = f), { populate: () => ({ sort: async () => [] }) });
  const locProv = { _id: id() };
  const listLocs = async (query = {}) => {
    const r = mockRes();
    await getPickupLocations({ params: { providerId: locProv._id.toString() }, query, provider: locProv }, r);
    return r.code;
  };
  Region.exists = async () => null;
  assert.equal(await listLocs({ region: 'Atlantis' }), 400);
  Region.exists = async () => ({ _id: id() });
  assert.equal(await listLocs({ region: 'Bangkok' }), 200);
  assert.deepEqual(locFilter, { provider: locProv._id, region: 'Bangkok' });
  assert.equal(await listLocs(), 200);
  assert.deepEqual(locFilter, { provider: locProv._id });

  console.log('smoke ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
