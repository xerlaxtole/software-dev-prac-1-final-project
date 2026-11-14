const express = require('express');
const router = express.Router({ mergeParams: true });
// const { protect, authorize } = require('../middleware/auth');

// TODO (Person A):
//   GET    /            protect   search ?region= &provider= &type= &start= &end= (free cars)  req 3, R2.1
//   GET    /:id         protect   one car + provider                                           req 3
//   POST   /            owner     add car            (mounted at /providers/:providerId/cars)
//   PUT    /:id         owner     update car
//   DELETE /:id         owner     delete; 409 if upcoming bookings

module.exports = router;
