const express = require('express');
const { getRegions } = require('../controllers/regions');

const router = express.Router();

router.get('/', getRegions); //req R1 — public master list of the 77 provinces

module.exports = router;
