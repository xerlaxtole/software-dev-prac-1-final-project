const express = require('express');
const router = express.Router();
// const { protect, authorize } = require('../middleware/auth');

// TODO (Person A):
//   GET    /                 protect          list/filter ?region= &search= &page= &limit=   req 3, R2.1
//   GET    /export           protect          providers CSV (define BEFORE /:providerId)      req A2
//   GET    /:providerId      protect                                                          req 3
//   POST   /                 authorize(admin,provider)  create (provider: own, one only)
//   PUT    /:providerId      owner            update name/address/tel
//   DELETE /:providerId      owner|admin      delete + cascade cars/locations/requests/bookings
//   GET    /:providerId/regions              protect                                          req R1.2
//   POST   /:providerId/regions              owner   { regions: [...] }                       req R1.1
//   PUT    /:providerId/regions              owner   replace whole set                        req R1.3
//   DELETE /:providerId/regions/:region      owner   409 if a pickup-location uses it         req R1.4
//
// Nested (re-route into Person B / cars routers with mergeParams):
//   /:providerId/cars              -> routes/cars
//   /:providerId/pickup-locations  -> routes/pickupLocations
//   /:providerId/pickup-requests   -> routes/pickupRequests
//   /:providerId/bookings          -> routes/bookings

module.exports = router;
