# Service Marketplace

A cross-platform **Android/iOS app** built with React Native and Expo, backed by Django REST Framework. Customers and providers use the mobile app; platform administrators use Django Admin.

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate                 # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env                      # Windows: copy .env.example .env
python manage.py migrate
python manage.py seed_catalog
python manage.py seed_demo_marketplace    # optional, local development only
python manage.py runserver 0.0.0.0:8001
```

Create an administrator separately with `python manage.py createsuperuser`, then visit `http://localhost:8001/admin/`. The development seed creates a demo provider, customer, published listings, weekly availability, and one pending booking. Its sample KYC approval and credentials are strictly for local development; do not use them in a deployed environment.

The backend's default email provider prints verification and password-reset codes to the console during development. Configure SMTP before deployment. Payments use eSewa's test gateway by default; set the `ESEWA_*` variables in `backend/.env` for the intended environment. Payment outcomes are verified by the server against eSewa, not accepted from a mobile-client success flag.

## Mobile app setup

```bash
cd frontend
npm ci
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to the backend's reachable base URL when needed. The default development API port is `8001`. Android emulators use their host bridge automatically; physical devices should use the computer's LAN address, for example `http://192.168.1.20:8001/`, and the backend must allow that host. Keep the trailing slash. `EXPO_PUBLIC_API_URL` is embedded in the client bundle and must never contain a secret.

## Implemented marketplace flows

- Client/provider registration, email OTP verification, role-aware navigation, sign-in, and password reset.
- Provider profiles, KYC submission/review, and dashboard access while KYC is pending. Publishing is denied by the backend until KYC approval.
- Service discovery, provider listings, local availability, and booking requests through the central `ProjectBooking` model.
- Negotiated offers, explicit booking state transitions, server-verified eSewa payments, chat, delivery, revision requests, completion, reviews, and notifications.
- Django Admin management for users, KYC, catalog, bookings, payments, reviews, and reports.

## Validation

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test bookings.tests catalog.tests

cd ../frontend
npm run typecheck
```
