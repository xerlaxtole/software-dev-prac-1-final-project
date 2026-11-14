const express = require('express');
const { register, login, getMe, logout, deleteMe } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register); //req 1
router.post('/login', login); //req 2
router.get('/logout', protect, logout); //req 2
router.route('/me').get(protect, getMe).delete(protect, deleteMe); //req 2, A3

module.exports = router;
