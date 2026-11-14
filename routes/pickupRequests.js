const express = require('express');
const router = express.Router({ mergeParams: true });
// const { protect, authorize } = require('../middleware/auth');

// TODO (Person B): one router, three mount points — branch on req.params.bookingId / req.params.providerId
//   On a booking (mounted at /bookings/:bookingId/pickup-request):
//     POST   /        self        request { name, address, region? } (replaces a rejected one)   req P3.6
//     GET    /        self|admin  see request + status                                           req P3.6
//     DELETE /        self        cancel while pending                                           req P3.6
//   On a provider (/providers/:providerId/pickup-requests):
//     GET    /        owner       list ?status=pending                                           req P3.7
//   Standalone (/pickup-requests/:id):
//     PUT    /:id/approve   owner  { addToList?: true } needs a valid in-region value            req P3.8
//     PUT    /:id/reject    owner  { reviewNote? }                                               req P3.8

module.exports = router;
