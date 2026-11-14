const mongoose = require('mongoose');

// Seeded master list of the 77 Thai provinces (see config/provinces.js + seed/seedRegions.js).
const RegionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  nameTh: { type: String, trim: true },
});

module.exports = mongoose.model('Region', RegionSchema);
