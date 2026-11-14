const express = require('express');
const {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  exportProviders,
} = require('../controllers/providers');
const {
  getProviderRegions,
  addProviderRegions,
  replaceProviderRegions,
  removeProviderRegion,
} = require('../controllers/regions');
const { protect, authorize, loadProvider } = require('../middleware/auth');

//Other resource routers
const carRouter = require('./cars');
const bookingRouter = require('./bookings');
const pickupLocationRouter = require('./pickupLocations');
const pickupRequestRouter = require('./pickupRequests');

const router = express.Router();
const manager = [protect, authorize('admin', 'provider'), loadProvider(true)];

//Re-route into other resource routers
router.use('/:providerId/cars', carRouter);
router.use('/:providerId/bookings', bookingRouter);
router.use('/:providerId/pickup-locations', pickupLocationRouter);
router.use('/:providerId/pickup-requests', pickupRequestRouter);

//Must be declared before /:id
router.get('/export', protect, exportProviders); //req A2

//Region of service
router
  .route('/:providerId/regions')
  .get(protect, loadProvider(false), getProviderRegions) //req R1.2
  .post(...manager, addProviderRegions) //req R1.1
  .put(...manager, replaceProviderRegions); //req R1.3
router.delete('/:providerId/regions/:region', ...manager, removeProviderRegion); //req R1.4

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
