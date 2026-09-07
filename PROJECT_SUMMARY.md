# SolWash - Local Development Guide & Reference

SolWash is a complete solar panel cleaning & maintenance platform configured to run 100% locally.

---

## 1. Local Services Architecture

When running locally, three services are started concurrently:
- **Backend REST API:** [http://localhost:5000](http://localhost:5000)
  - Health Check: `http://localhost:5000/api/health`
  - API Base: `http://localhost:5000/api`
  - Built-in SQLite Database (`./backend/src/data/solwash.db`)
- **Admin Management Panel:** [http://localhost:3000](http://localhost:3000)
  - Default Admin Email: `admin@solwash.com` (or username `admin`)
  - Default Admin Password: `Admin@123456` (or `admin`)
- **Mobile Web App Preview:** [http://localhost:3001](http://localhost:3001)
  - Customer interface for booking cleaning services, tracking orders, and viewing pricing.

---

## 2. Running Locally

To start all services together:
```bash
cd /home/linux/Desktop/solwash
./start.sh
# or
npm start
```

To stop all background services:
```bash
./stop.sh
```

---

## 3. Local Authentication & Payment Features

- **Instant Phone Login:** Enter any 10-digit mobile number on localhost to test customer sessions immediately.
- **Email OTP Login:** Generates OTP directly visible in the backend console (`🔑 [SOLWASH OTP] Code: xxxxxx`) for effortless local verification without needing external SMTP servers.
- **Sandbox Payments:** Built-in test sandbox allows instant payment simulation without requiring external payment gateways.
