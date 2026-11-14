//Offline smoke check (no DB): models are stubbed where the controllers touch the database.
//Run: npm run check
const assert = require('node:assert');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const { authorize, canManage } = require('../middleware/auth');
const { addBooking } = require('../controllers/bookings');

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

  console.log('smoke ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
