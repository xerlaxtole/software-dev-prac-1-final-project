const express = require('express');
const {
  getPickupLocations,
  getPickupLocation,
  addPickupLocation,
  updatePickupLocation,
  deletePickupLocation,
} = require('../controllers/pickupLocations');
const { protect, authorize, loadProvider } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(protect, loadProvider(false), getPickupLocations)
  .post(protect, authorize('admin', 'provider'), loadProvider(true), addPickupLocation); 
router
  .route('/:id')
  .get(protect, getPickupLocation) 
  .put(protect, authorize('admin', 'provider'), updatePickupLocation) 
  .delete(protect, authorize('admin', 'provider'), deletePickupLocation);

module.exports = router;
