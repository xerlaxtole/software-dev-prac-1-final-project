# Handoff — Person B (Kantapon): Bookings & Pick-ups

I'm Kantapon, joining a 2-person backend project: the **Software Dev Prac 1 final project**, a Rental Car Booking REST API (Express 5 + MongoDB/Mongoose + JWT). The codebase is a port of our VacQ assignment (Hospital → Provider, Appointment → Booking) and already has security middleware, auth, providers and the core of bookings working. I own **Person B: Bookings & Pick-ups**; my teammate Anantawat is **Person A: Identity & Catalog**. Help me finish my half. Everything you need is below.

## Setup

1. `git clone https://github.com/xerlaxtole/software-dev-prac-1-final-project.git && cd software-dev-prac-1-final-project && npm install`
2. `cp config/config.env.example config/config.env` → fill `MONGO_URI` (Atlas), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (also `PORT`, `NODE_ENV`, `JWT_EXPIRE=30d`, `JWT_COOKIE_EXPIRE=30`, `RATE_LIMIT_MAX=100`)
3. `npm run seed` → loads the 77 Thai provinces into `regions` and creates the admin account (register refuses `role=admin`)
4. `npm run dev` → `GET /api/v1/health` · `npm run check` → offline smoke test (stubs models, no DB)
5. `git checkout -b kantapon/bookings-pickups`

Layout (MVC): `config/ models/ middleware/ controllers/ routes/ seed/ test/ server.js`. CommonJS, async/await, one try/catch per handler.

## Data model (all built in `models/`, timestamps on all)

| Model | Fields |
|---|---|
| User | name, tel (`^0[0-9]{8,9}$`), email (unique, lowercase), password (bcrypt, `select:false`), role `user \| provider \| admin` |
| Provider | name (unique), address, tel, owner (→User, unique: one provider per provider account), serviceRegions `[String]` (each must exist in regions; validated on save) |
| Region | name (unique, e.g. `Bangkok`), nameTh — 77 provinces, seeded |
| Car | provider (→Provider), brand, model, licensePlate (unique), type (`sedan\|suv\|hatchback\|van\|pickup`, optional), seats (2–15, optional), dailyRate (>0) |
| PickupLocation | provider (→Provider), name (unique per provider — compound index), address, region (must be ∈ provider.serviceRegions — check in the controller) |
| PickupRequest | booking (→Booking, **unique**), user (→User), provider (→Provider), name, address, region (optional), status `pending\|approved\|rejected` (default pending), reviewNote, reviewedAt |
| Booking | user, car, provider (copied from `car.provider`), startDate, endDate (model rejects endDate < startDate as a ValidationError), pickupLocation (optional), pickupRequest (optional). Index on `{car, startDate, endDate}` |

Effective pick-up = `pickupLocation` if set, else the approved `pickupRequest`, else the provider's address.

## Contract (shared with Anantawat — don't change without telling them)

- Success: `{ success: true, data, count?, pagination? }` · error: `{ success: false, message }`.
- Codes: 400 validation · 401 no/bad token · 403 wrong role / not owner · 404 not found · 409 conflict.
- `middleware/auth.js`:
  - `protect` — Bearer header or httpOnly cookie `token`; sets `req.user` = full User doc.
  - `authorize(...roles)`
  - `canManage(provider, user)` → true for admin or the provider's owner.
- Codebase style: writes catch → `res.status(400).json({ success: false, message: err.message })`; reads catch → 500 with a fixed message. Ownership failures → 403.
- Only role `user` can create a booking (route uses `authorize('user')`).

## Already done in `controllers/bookings.js` (don't rewrite, extend)

- **getBookings** — `GET /bookings` and `/providers/:providerId/bookings`. User: own · provider: its provider's (403 if `:providerId` isn't theirs) · admin: all. Populates car + provider.
- **getBooking** — `GET /bookings/:id`. Self or admin, else 403.
- **addBooking** — `POST /cars/:carId/bookings`. 404 unknown car, 400 if the user already has 3, copies provider from the car, 201.
- **updateBooking** — `PUT /bookings/:id`. Self/admin; whitelists startDate, endDate, pickupLocation; uses `save()` so the date validator runs.
- **deleteBooking** — `DELETE /bookings/:id`. Self/admin; also deletes its PickupRequest.

## Routing already wired (`express.Router({ mergeParams: true })`)

| Path | Router |
|---|---|
| `/api/v1/bookings` | `routes/bookings.js` |
| `/api/v1/cars/:carId/bookings` | `routes/bookings.js` (POST create) |
| `/api/v1/providers/:providerId/bookings` | `routes/bookings.js` |
| `/api/v1/pickup-locations` | `routes/pickupLocations.js` (stub) |
| `/api/v1/providers/:providerId/pickup-locations` | `routes/pickupLocations.js` |
| `/api/v1/pickup-requests` | `routes/pickupRequests.js` (stub) |
| `/api/v1/providers/:providerId/pickup-requests` | `routes/pickupRequests.js` |
| `/api/v1/bookings/:bookingId/pickup-request` | `routes/pickupRequests.js` |

The pickupRequests router is mounted in 3 places — branch on `req.params.bookingId` / `req.params.providerId`.

## My TODO

### Bookings (`controllers/bookings.js` + `routes/bookings.js`)

1. **Overlap → 409** in addBooking: another booking on the same car with `start1 ≤ end2 && start2 ≤ end1` — query `{ car, startDate: { $lte: newEnd }, endDate: { $gte: newStart } }`. Re-run it in updateBooking when dates change, excluding the booking itself (`_id: { $ne: booking._id }`).
2. **pickupLocation** (create + update) must belong to the booking's provider → else 400. Setting pickupLocation cancels a pending pickupRequest for that booking.
3. **Changing `car` on update**: allow it, re-run overlap, re-copy provider from the new car, and if the provider changed clear pickupLocation and delete/clear the pickupRequest.
4. **`GET /bookings/export`** (declare BEFORE `/:id`) — CSV of own bookings (admin: all). Columns: `bookingId, startDate, endDate, carBrand, carModel, licensePlate, providerName, providerTel, pickupName, pickupAddress, createdAt`. `res.set('Content-Type', 'text/csv')`; `res.set('Content-Disposition', 'attachment; filename=bookings.csv')`; build the string by hand, quote fields containing comma/quote/newline. No CSV library. **[req A1]**

### Pick-up locations (new `controllers/pickupLocations.js` + `routes/pickupLocations.js`)

"owner" = load the provider, then `canManage(provider, req.user)`, else 403.

| Method | Path | Access | Behavior | Req |
|---|---|---|---|---|
| GET | `/providers/:providerId/pickup-locations?region=` | protect | list | P3.2, P3.5 |
| POST | `/providers/:providerId/pickup-locations` | owner | `{name, address, region}`; region ∈ serviceRegions else 400; duplicate name → 409 | P3.1 |
| GET | `/pickup-locations/:id` | protect | one | P3.2 |
| PUT | `/pickup-locations/:id` | owner | update; region still ∈ serviceRegions | P3.3 |
| DELETE | `/pickup-locations/:id` | owner | delete; `Booking.updateMany({ pickupLocation: id }, { pickupLocation: null })` | P3.4 |

### Pick-up requests (new `controllers/pickupRequests.js` + `routes/pickupRequests.js`)

| Method | Path | Access | Behavior | Req |
|---|---|---|---|---|
| POST | `/bookings/:bookingId/pickup-request` | booking owner | `{name, address, region?}`; if a REJECTED request exists delete it first (unique index); if a pending/approved one exists → 409; user/provider from the booking; set `booking.pickupRequest` | P3.6 |
| GET | `/bookings/:bookingId/pickup-request` | self/admin | the request + status | P3.6 |
| DELETE | `/bookings/:bookingId/pickup-request` | booking owner | only while pending; clear `booking.pickupRequest` | P3.6 |
| GET | `/providers/:providerId/pickup-requests?status=pending` | owner | list (default pending) | P3.7 |
| PUT | `/pickup-requests/:id/approve` | owner | pending only; status=approved, reviewedAt=now; optional `{addToList: true}` also creates a PickupLocation — requires a region ∈ serviceRegions else 400 | P3.8 |
| PUT | `/pickup-requests/:id/reject` | owner | pending only; status=rejected, reviewedAt=now, `{reviewNote?}` | P3.8 |

## Dependency on Person A (Anantawat)

Cars CRUD isn't built yet (Anantawat's part). To test bookings now: register a `role=provider` account, `POST /providers` (with `serviceRegions` like `["Bangkok"]`), then insert a test car directly in Atlas (or a throwaway seed) with that provider's `_id`.

## Tests / demo

- Add a case to `test/smoke.test.js` for each new rule (stub the model statics like the existing addBooking checks); keep `npm run check` green.
- Write Postman tests for every endpoint above, including negatives: 4th booking → 400, overlap → 409, provider/admin creating a booking → 403. They merge into the team collection for the Newman demo.

Start with the overlap check, then pick-up locations, then pick-up requests, then the CSV export.
