// Minimal offline smoke check (no DB needed): verifies the two bits of Phase-0 logic.
// Run: npm run check
const assert = require('node:assert');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const { authorize } = require('../middleware/auth');

// 1) authorize() blocks a role that isn't listed.
let blocked = false;
const res = { status: () => ({ json: () => { blocked = true; } }) };
authorize('admin')({ user: { role: 'user' } }, res, () => { throw new Error('next() should not be called'); });
assert.ok(blocked, 'authorize should reject a non-admin');

// 2) authorize() lets a listed role through.
let passed = false;
authorize('admin', 'user')({ user: { role: 'user' } }, {}, () => { passed = true; });
assert.ok(passed, 'authorize should allow a listed role');

// 3) Booking rejects endDate before startDate.
(async () => {
  const id = () => new mongoose.Types.ObjectId();
  const bad = new Booking({ user: id(), car: id(), provider: id(), startDate: new Date('2026-12-20'), endDate: new Date('2026-12-18') });
  await assert.rejects(bad.validate(), /endDate/, 'booking should reject endDate < startDate');

  const good = new Booking({ user: id(), car: id(), provider: id(), startDate: new Date('2026-12-20'), endDate: new Date('2026-12-23') });
  await good.validate(); // should not throw

  console.log('smoke ok');
})();
