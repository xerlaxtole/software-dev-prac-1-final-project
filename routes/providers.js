const express = require('express');
const {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
} = require('../controllers/providers');
const { protect, authorize } = require('../middleware/auth');

//Other resource routers
const carRouter = require('./cars');
const bookingRouter = require('./bookings');
const pickupLocationRouter = require('./pickupLocations');
const pickupRequestRouter = require('./pickupRequests');

const router = express.Router();

//Re-route into other resource routers
router.use('/:providerId/cars', carRouter);
router.use('/:providerId/bookings', bookingRouter);
router.use('/:providerId/pickup-locations', pickupLocationRouter);
router.use('/:providerId/pickup-requests', pickupRequestRouter);

// TODO (Person A): GET /export (must be declared BEFORE /:id) + the /:providerId/regions endpoints

router
  .route('/')
  .get(protect, getProviders) //req 3, R2.1
  .post(protect, authorize('admin', 'provider'), createProvider);
router
  .route('/:id')
  .get(protect, getProvider) //req 3
  .put(protect, authorize('admin', 'provider'), updateProvider)
  .delete(protect, authorize('admin', 'provider'), deleteProvider);

module.exports = router;
