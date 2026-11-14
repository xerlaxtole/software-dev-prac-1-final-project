# Rental Car Booking — Backend (2110503 final project)

REST API for renting cars from providers. Stack: **Express 5 + MongoDB (Mongoose) + JWT**.
Built on the VacQ (assignment 10) codebase: Hospital → Provider, Appointment → Booking.
Every unbuilt endpoint (method, access, requirement code) is listed as a TODO in its `routes/*.js` / `controllers/*.js`.

## Setup
```bash
npm install
cp config/config.env.example config/config.env   # fill MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed        # 77 Thai provinces + the admin account (run once per database)
npm run dev
npm run check       # offline smoke test (no DB needed)
```
Health: `GET /api/v1/health` · Swagger (extra, not the graded demo): `/api-docs`

## What the base already does
- **Security** (from VacQ a10): helmet, cors, rate limit (`RATE_LIMIT_MAX`, default 100 / 10 min), mongo-sanitize, xss, hpp.
- **Auth**: register (`role` = user | provider; admin only via seed), login, logout, me — JWT in Bearer header or httpOnly cookie.
- **Providers** (was hospitals): list with filter / `?region=` / select / sort / pagination, get, create (provider owns one), update (name/address/tel), delete (cascades cars, pick-ups, bookings).
- **Bookings** (was appointments): list (user own · provider theirs · admin all), get, create at `POST /cars/:carId/bookings` (users only, max 3, provider copied from car), update dates/pick-up, delete (+ its pick-up request).
- **Regions**: `GET /regions` (public, 77 provinces); a provider's service regions — view, add, replace, remove (409 while a pick-up location uses one).
- **Cars**: search `GET /cars?region=&provider=&type=&start=&end=` (dates → only cars free for the whole range), get, create at `POST /providers/:providerId/cars`, update, delete (409 with current/upcoming bookings).
- **CSV**: `GET /providers/export`; shared `utils/csv.js` (`toCsv`) quotes fields, blocks Excel formula injection, adds a BOM for Thai text.
- **Delete account**: `DELETE /auth/me` removes own bookings + pick-up requests (409 for a provider that still owns a provider).
- All 7 models: User, Provider, Region, Car, PickupLocation, PickupRequest, Booking.

## Contract (don't change without telling the other person)
- Envelope: `{ success: true, data, count?, pagination? }` / `{ success: false, message }`; codes 400/401/403/404/409.
- `req.user` = full User doc (from `protect`); roles `user | provider | admin`.
- Ownership of provider-scoped things: `canManage(provider, req.user)` from `middleware/auth.js`, or the route middleware `loadProvider(true)` (sets `req.provider`, 404/403 for you).
- Only role `user` can create a booking; `Booking.provider` is copied from `car.provider`.

## What's left
| | Person A — Anantawat (Identity & Catalog) | Person B — Kantapon (Bookings & Pick-ups) |
|---|---|---|
| Endpoints | ✅ done (auth, delete account, providers + CSV, regions, cars) — Postman tests left | booking overlap (409) + car change on edit · `GET /bookings/export` · pick-up locations CRUD · pick-up requests (request / cancel / list / approve / reject) |
| Reqs | 1, 2, 3, A2, A3, R1.1–1.4, R2.1 ✅ | A1, P3.1–3.8, overlap rule |

Each person writes Postman tests for their endpoints; merge into one collection for the Newman demo.
