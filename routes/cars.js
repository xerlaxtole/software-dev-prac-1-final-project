const express = require('express');
const { getCars, getCar, createCar, updateCar, deleteCar } = require('../controllers/cars');
const { protect, authorize, loadProvider } = require('../middleware/auth');

const bookingRouter = require('./bookings');

//Mounted at /cars and /providers/:providerId/cars
const router = express.Router({ mergeParams: true });

//Re-route: POST /cars/:carId/bookings → bookings controller (only users rent)
router.use('/:carId/bookings', bookingRouter);

router
  .route('/')
  .get(protect, getCars) //req 3, R2.1 — ?region= ?type= ?provider= ?start=&end=
  .post(protect, authorize('admin', 'provider'), loadProvider(true), createCar); //at /providers/:providerId/cars
router
  .route('/:id')
  .get(protect, getCar) //req 3
  .put(protect, authorize('admin', 'provider'), updateCar)
  .delete(protect, authorize('admin', 'provider'), deleteCar);

module.exports = router;
