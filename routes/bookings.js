const express = require('express');
const {
  getBookings,
  getBooking,
  addBooking,
  updateBooking,
  deleteBooking,
  exportBookings,
} = require('../controllers/bookings');
const { protect, authorize } = require('../middleware/auth');

const pickupRequestRouter = require('./pickupRequests');

//Mounted at /bookings, /providers/:providerId/bookings and /cars/:carId/bookings
const router = express.Router({ mergeParams: true });

//Re-route: /bookings/:bookingId/pickup-request (Person B, req P3.6)
router.use('/:bookingId/pickup-request', pickupRequestRouter);

router.get('/export', protect, exportBookings); //req A1

router
  .route('/')
  .get(protect, getBookings) //req 4, 7
  .post(protect, authorize('user'), addBooking); //req 3 — only users rent (provider/admin → 403)
router
  .route('/:id')
  .get(protect, getBooking) //req 4, 7
  .put(protect, authorize('admin', 'user'), updateBooking) //req 5, 8
  .delete(protect, authorize('admin', 'user'), deleteBooking); //req 6, 9

module.exports = router;
