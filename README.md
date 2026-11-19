# Friends Hisaab — Financial Management System (PKR)

Private, full-stack financial ledger built for **Faraz Ahmed**, **Peer Bux**, and **Mir Hassan** to manage lending, borrowing, FIFO/specific repayments, payment reminders, WhatsApp Click-to-Chat alerts, and financial audit reports in Pakistani Rupees (PKR).

## Core Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (Light & Dark mode), Lucide Icons, Recharts, jsPDF, SheetJS (`xlsx`)
- **Backend**: TypeScript Express server (`server.ts`) with Zod validation, bcryptjs password hashing, JWT HTTP-only cookies, login rate limiting, and CSRF origin checks
- **Database**: MongoDB Atlas via Mongoose (`users`, `transactions`, `repayments`, `reminders`, `notifications`, `audit_logs`) with BSON ObjectId validation, `Decimal128` + integer-paisa exact monetary arithmetic, and atomic multi-document transactions. When `MONGODB_URI` is not yet configured in `.env`, the server persists to `.data/friends_hisaab.json` using identical ObjectId and ledger semantics so local previews work immediately.

## Registered Members

1. **Faraz Ahmed** — `faraz.maju@gmail.com` (`03332853138` / `923332853138`)
2. **Peer Bux** — `pirbux388@gmail.com` (`0342 3731281` / `923423731281`)
3. **Mir Hassan** — `mirhassan@gmail.com` (`0344 3579010` / `923443579010`)

## Environment Setup

Copy `.env.example` to `.env` and populate your MongoDB Atlas credentials and secrets:

```bash
cp .env.example .env
```

Required variables:

- `MONGODB_URI`: `mongodb+srv://farazmaju_db_user:<DB_PASSWORD>@cluster0.9964f0p.mongodb.net/friends_hisaab?retryWrites=true&w=majority`
- `DATABASE_NAME`: `friends_hisaab`
- `AUTH_SECRET` / `NEXTAUTH_SECRET`: 32+ character random signing secret
- `SEED_PASSWORD_FARAZ`, `SEED_PASSWORD_PEER_BUX`, `SEED_PASSWORD_MIR_HASSAN` (optional overrides for the configured initial member passwords)

## Vercel Deployment

Vercel serves the Vite frontend and routes `/api/*` to the Express API function in `api/[...path].ts`. Add `MONGODB_URI`, `DATABASE_NAME`, and `AUTH_SECRET` to the Vercel project's Environment Variables for each deployment environment, and allow the deployment to connect to MongoDB Atlas. The local `.env` file is not deployed. Redeploy after changing environment variables.

## Commands

```bash
# Install dependencies
npm install

# Run idempotent database seed (creates the 3 members + MongoDB indexes)
npm run seed

# Start development server on port 3000
npm run dev

# Typecheck
npm run lint

# Build production frontend bundle
npm run build

# Start production server
NODE_ENV=production npm start
```
