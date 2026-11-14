//Offline smoke check (no DB): models are stubbed where the controllers touch the database.
//Run: npm run check
const assert = require('node:assert');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const { authorize, canManage, loadProvider } = require('../middleware/auth');
const { addBooking } = require('../controllers/bookings');
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

  //addBooking(): 404 unknown car · 400 at 3 bookings · 201 copies provider from the car
  const req = { params: { carId: 'c1' }, user: { id: 'u1' }, body: { startDate: '2026-12-20', endDate: '2026-12-23' } };

  Car.findById = async () => null;
  let res = mockRes();
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
  res = mockRes();
  await addBooking(req, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.provider, carProvider);

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
