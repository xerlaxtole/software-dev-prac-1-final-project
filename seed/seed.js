//Run once per database: npm run seed
//  1) loads the 77 Thai provinces into `regions` (serviceRegions are validated against it)
//  2) creates the admin account from ADMIN_* env vars (register refuses role=admin)
const dotenv = require('dotenv');
dotenv.config({ path: './config/config.env' });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Region = require('../models/Region');
const User = require('../models/User');
const provinces = require('../config/provinces');

(async () => {
  await connectDB();

  await Region.deleteMany();
  await Region.insertMany(provinces);
  console.log(`Seeded ${provinces.length} regions`);

  const { ADMIN_NAME, ADMIN_TEL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (await User.exists({ email: ADMIN_EMAIL.toLowerCase() })) {
      console.log(`Admin ${ADMIN_EMAIL} already exists`);
    } else {
      await User.create({
        name: ADMIN_NAME || 'Admin',
        tel: ADMIN_TEL || '0800000000',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
      });
      console.log(`Created admin ${ADMIN_EMAIL}`);
    }
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipped admin');
  }

  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
