const express = require('express');
const { register, login, getMe, logout } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register); //req 1
router.post('/login', login); //req 2
router.get('/logout', protect, logout); //req 2
router.get('/me', protect, getMe); //req 2
// TODO (Person A): router.delete('/me', protect, deleteMe);  //req A3

module.exports = router;
