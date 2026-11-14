const express = require('express');
const router = express.Router({ mergeParams: true });
// const { protect, authorize } = require('../middleware/auth');

// TODO (Person B):
//   GET    /            protect   user→own · admin→all · provider→their cars           req 4, 7
//   GET    /export      protect   own bookings CSV (admin: all)                         req A1
//   GET    /:id         self|admin  one + car/provider/pickup                           req 4, 7
//   POST   /            USER ONLY  (at /cars/:carId/bookings) { startDate,endDate,pickupLocation? }
//                                  400 if user already has 3 · 409 if car taken (overlap)
//                                  provider & admin cannot rent -> 403                  req 3, P3.5
//   PUT    /:id         self|admin  edit dates/car/pickup (re-check overlap; reconcile pickupRequest)  req 5, 8
//   DELETE /:id         self|admin  delete + its pickup request                         req 6, 9

module.exports = router;
