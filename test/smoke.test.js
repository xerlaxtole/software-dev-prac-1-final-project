//Offline smoke check (no DB): models are stubbed where the controllers touch the database.
//Run: npm run check
const assert = require('node:assert');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const { authorize, canManage } = require('../middleware/auth');
const { addBooking, updateBooking } = require('../controllers/bookings');
const PickupRequest = require('../models/PickupRequest');
const Provider = require('../models/Provider');
const PickupLocation = require('../models/PickupLocation');
const { deleteMe } = require('../controllers/auth');
const { removeProviderRegion } = require('../controllers/regions');
const { deleteCar } = require('../controllers/cars');
const { toCsv } = require('../utils/csv');

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
  const upd = (body, user = { role: 'user', id: owner.toString() }) => ({ params: { id: 'b1' }, user, body });
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

  console.log('smoke ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
