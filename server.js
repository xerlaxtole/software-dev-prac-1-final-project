const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

dotenv.config({ path: './config/config.env' });
connectDB();

const app = express();
app.set('query parser', 'extended'); // Express 5 defaults to 'simple', which drops ?region[gt]=... style queries
app.use(express.json());
app.use(cookieParser());

app.get('/api/v1/health', (req, res) => res.status(200).json({ success: true, data: 'ok' }));

// --- Person A ---
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/regions', require('./routes/regions'));
app.use('/api/v1/providers', require('./routes/providers'));
app.use('/api/v1/cars', require('./routes/cars'));
// --- Person B ---
app.use('/api/v1/pickup-locations', require('./routes/pickupLocations'));
app.use('/api/v1/pickup-requests', require('./routes/pickupRequests'));
app.use('/api/v1/bookings', require('./routes/bookings'));

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () =>
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);

process.on('unhandledRejection', (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
