const express = require('express');
const { createPickupRequest, getPickupRequest, cancelPickupRequest } = require('../controllers/pickupRequests');
const { protect, authorize } = require('../middleware/auth');

//One router, three mount points: /bookings/:bookingId/pickup-request, /providers/:providerId/pickup-requests, /pickup-requests
const router = express.Router({ mergeParams: true });

//Guards: run a route only under its own mount point, otherwise skip it (next('route')) → unknown paths fall through to 404
const onBooking = (req, res, next) => (req.params.bookingId ? next() : next('route'));

//On a booking: /bookings/:bookingId/pickup-request                      req P3.6
router
  .route('/')
  .all(onBooking)
  .post(protect, authorize('user'), createPickupRequest)
  .get(protect, getPickupRequest)
  .delete(protect, authorize('user'), cancelPickupRequest);

module.exports = router;
