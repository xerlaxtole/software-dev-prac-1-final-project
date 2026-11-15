const express = require('express');
const {
  createPickupRequest,
  getPickupRequest,
  cancelPickupRequest,
  getPickupRequests,
  approvePickupRequest,
  rejectPickupRequest,
} = require('../controllers/pickupRequests');
const { protect, authorize, loadProvider } = require('../middleware/auth');

//One router, three mount points: /bookings/:bookingId/pickup-request, /providers/:providerId/pickup-requests, /pickup-requests
const router = express.Router({ mergeParams: true });

//Guards: run a route only under its own mount point, otherwise skip it (next('route')) → unknown paths fall through to 404
const onBooking = (req, res, next) => (req.params.bookingId ? next() : next('route'));
const onProvider = (req, res, next) => (req.params.providerId ? next() : next('route'));
const standalone = (req, res, next) => (req.params.bookingId || req.params.providerId ? next('route') : next());

//On a booking: /bookings/:bookingId/pickup-request                      req P3.6
router
  .route('/')
  .all(onBooking)
  .post(protect, authorize('user'), createPickupRequest)
  .get(protect, getPickupRequest)
  .delete(protect, authorize('user'), cancelPickupRequest);

//On a provider: /providers/:providerId/pickup-requests?status=          req P3.7
router.get('/', onProvider, protect, authorize('admin', 'provider'), loadProvider(true), getPickupRequests);

//Standalone: /pickup-requests/:id/approve|reject                         req P3.8
router.put('/:id/approve', standalone, protect, authorize('admin', 'provider'), approvePickupRequest);
router.put('/:id/reject', standalone, protect, authorize('admin', 'provider'), rejectPickupRequest);

module.exports = router;
