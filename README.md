# Rental Car Booking API

2110503 Software Dev Prac 1 final project. Backend for renting cars from providers (Express + MongoDB).

## Setup

You need Node.js and a MongoDB Atlas database.

```bash
npm install
cp config/config.env.example config/config.env
```

Open `config/config.env` and fill in `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
Set `PORT=5050` because the Postman collection uses that port.

Then add the provinces and the admin account (only once per database):

```bash
npm run seed
```

## Run

```bash
npm run dev
```

Check it works: http://localhost:5050/api/v1/health

API docs (Swagger): http://localhost:5050/api-docs

## Test with Newman

Install Newman once:

```bash
npm install -g newman
```

Start the server first, then run it with the same admin email/password you put in `config.env`:

```bash
newman run postman/RentalCarBooking.postman_collection.json --env-var adminEmail=YOUR_ADMIN_EMAIL --env-var adminPassword=YOUR_ADMIN_PASSWORD
```

If you get `429 Too Many Requests`, set `RATE_LIMIT_MAX=1000` in `config/config.env` and restart the server.

## Folders

- `routes/`, `controllers/`, `models/`, `middleware/` - the API code
- `seed/` - seed script
- `postman/` - Postman collection
- `openapi/` - OpenAPI spec (`paths/` = endpoints, `components/schemas/` = models)
