const express = require('express');
// const { protect, authorize } = require('../middleware/auth');

const bookingRouter = require('./bookings');

//Mounted at /cars and /providers/:providerId/cars
const router = express.Router({ mergeParams: true });

//Re-route: POST /cars/:carId/bookings → bookings controller (only users rent)
router.use('/:carId/bookings', bookingRouter);

// TODO (Person A):
//   GET    /            protect   search ?region= &provider= &type= &start= &end= (free cars)  req 3, R2.1
//   GET    /:id         protect   one car + provider                                           req 3
//   POST   /            owner     add car            (mounted at /providers/:providerId/cars)
//   PUT    /:id         owner     update car         (use canManage from middleware/auth)
//   DELETE /:id         owner     delete; 409 if upcoming bookings

module.exports = router;
