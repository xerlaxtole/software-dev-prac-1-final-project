# Rental Car Booking — Backend (2110503 final project)

REST API for renting cars from providers. Stack: **Express 5 + MongoDB (Mongoose) + JWT**.
Every endpoint (method, access, requirement code) is documented inline in its `routes/*.js` stub; the work split is in the table below.

## Setup
```bash
npm install
cp config/config.env.example config/config.env   # then fill in MONGO_URI + JWT_SECRET
npm run seed        # load the 77 Thai provinces into the regions collection (run once)
npm run dev         # start with nodemon
npm run check       # offline smoke test (no DB needed)
```
Health check: `GET http://localhost:5000/api/v1/health`

## Phase 0 — done (shared foundation)
- `server.js`, `config/db.js`, `config/provinces.js` + `seed/seedRegions.js`
- `middleware/auth.js` — `protect`, `authorize(...roles)`
- All 7 models: `User, Provider, Region, Car, PickupLocation, PickupRequest, Booking`
- Route files are **stubs** with a TODO per endpoint → hand off to A / B.

## Contract (locked — don't change without telling the other person)
- Response envelope: `{ success: true, data, count?, pagination? }` / `{ success: false, message }`, codes 400/401/403/404/409.
- `req.user` is the full User doc (from `protect`); role ∈ `user | provider | admin`.
- `authorize(...roles)` gatekeeps; ownership = `provider.owner === req.user.id || req.user.role === 'admin'`.
- Booking: `provider` is copied from `car.provider` on create. Only role `user` can create a booking.

## Who builds what
| | Person A — Identity & Catalog | Person B — Bookings & Pick-ups |
|---|---|---|
| Models | User, Provider, Region, Car | Booking, PickupLocation, PickupRequest |
| Routes | `auth, regions, providers, cars` | `bookings, pickupLocations, pickupRequests` |
| Reqs | 1, 2, 3, A2, A3, R1.1–1.4, R2.1 | 4, 5, 6, 7–9, A1, P3.1–3.8 |

Each person writes controllers + routes + Postman tests for their modules; merge into one collection for the Newman demo.

## Decisions (locked)
MongoDB · Car inventory kept (date range + overlap) · `register` accepts `role` · only `user` can rent · 77-province master list seeded.
