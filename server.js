const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('@exortek/express-mongo-sanitize');
const helmet = require('helmet');
const { xss } = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUI = require('swagger-ui-express');
const connectDB = require('./config/db');

//Load env vars before anything reads process.env
dotenv.config({ path: './config/config.env' });

//Connect to database
connectDB();

const app = express();

//Query parser (Express 5 defaults to 'simple', which drops dailyRate[gt]=...)
app.set('query parser', 'extended');

//Body parser + cookies
app.use(express.json());
app.use(cookieParser());

//Security: sanitize data, headers, XSS
app.use(mongoSanitize());
app.use(helmet());
app.use(xss());

//Rate limiting
// ponytail: one global limiter; a Newman run + rehearsals can exceed 100 req/10 min, so it's an env knob
app.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
  })
);

//Prevent http param pollution (Express 5: req.query is a getter, make it writable first)
app.use((req, res, next) => {
  Object.defineProperty(req, 'query', { value: { ...req.query }, writable: true });
  next();
});
app.use(hpp());

//Enable CORS
app.use(cors());

const PORT = process.env.PORT || 5000;

//Swagger (extra docs only — the graded demo runs through Postman/Newman)
const swaggerDocs = swaggerJsDoc({
  swaggerDefinition: {
    openapi: '3.0.0',
    info: { title: 'Rental Car Booking API', version: '1.0.0', description: 'Software Dev Prac 1 final project' },
    servers: [{ url: `http://localhost:${PORT}/api/v1` }],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }], 
    tags: [
      'Health', 'Auth', 'Regions', 'Providers', 'Provider service regions',
      'Cars', 'Pick-up locations', 'Bookings', 'Pick-up requests',
    ].map((name) => ({ name })),
  },
  apis: ['./openapi/**/*.yaml'],
});
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDocs));

app.get('/api/v1/health', (req, res) => res.status(200).json({ success: true, data: 'ok' }));

//Routes (nested resources are re-routed inside providers/cars/bookings routers)
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/regions', require('./routes/regions'));
app.use('/api/v1/providers', require('./routes/providers'));
app.use('/api/v1/cars', require('./routes/cars'));
app.use('/api/v1/bookings', require('./routes/bookings'));
app.use('/api/v1/pickup-locations', require('./routes/pickupLocations'));
app.use('/api/v1/pickup-requests', require('./routes/pickupRequests'));

const server = app.listen(PORT, () =>
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);

//Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
