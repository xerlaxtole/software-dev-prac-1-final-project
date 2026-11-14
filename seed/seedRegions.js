const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Region = require('../models/Region');
const provinces = require('../config/provinces');

dotenv.config({ path: './config/config.env' });

(async () => {
  await connectDB();
  await Region.deleteMany();
  await Region.insertMany(provinces);
  console.log(`Seeded ${provinces.length} regions`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
