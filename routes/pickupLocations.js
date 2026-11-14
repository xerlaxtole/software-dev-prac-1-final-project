const express = require('express');
const router = express.Router({ mergeParams: true });
// const { protect, authorize } = require('../middleware/auth');

// TODO (Person B):
//   GET    /            protect   list a provider's locations ?region=   (at /providers/:providerId/pickup-locations)  req P3.2, P3.5
//   POST   /            owner     create { name, address, region∈serviceRegions }                                      req P3.1
//   GET    /:id         protect   one location                                                                        req P3.2
//   PUT    /:id         owner     update                                                                              req P3.3
//   DELETE /:id         owner     delete; set bookings using it to pickupLocation:null                                 req P3.4

module.exports = router;
