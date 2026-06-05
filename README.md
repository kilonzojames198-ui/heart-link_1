# 💖 HeartLink — Deploy to Vercel + Neon

## Run locally

```bash
npm install
npm run dev
```
Open http://localhost:3000

---

## Deploy to Vercel (step by step)

### Step 1 — Get a free Neon PostgreSQL database

1. Go to https://console.neon.tech and sign up (free)
2. Click **New Project** → give it any name → **Create**
3. On the dashboard click **Connection string** → copy the full URL
   It looks like: `postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Step 2 — Push code to GitHub

```bash
git init
git add .
git commit -m "HeartLink initial"
git remote add origin https://github.com/YOUR_USERNAME/heartlink.git
git push -u origin main
```

### Step 3 — Deploy on Vercel

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub repo
3. Framework: **Other**
4. Build command: `npm install` (or leave blank)
5. Output directory: leave blank
6. Click **Deploy**

### Step 4 — Add Environment Variables on Vercel

Go to your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgres://...` (your Neon connection string) |
| `SESSION_SECRET` | any long random string e.g. `heartlink_abc123xyz789` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | `admin@heartlink.app` |
| `ADMIN_PASSWORD` | `Admin@2026!` |
| `APP_URL` | `https://your-project.vercel.app` |

Then go to **Deployments → Redeploy** so the variables take effect.

### Step 5 — Verify

Visit: `https://your-project.vercel.app/health`

You should see:
```json
{ "status": "ok", "users": 1, "env": "production" }
```

`users: 1` means the admin was created ✅

---

## Admin Login

| | |
|---|---|
| URL | `/auth/login` |
| Email | `admin@heartlink.app` |
| Password | `Admin@2026!` |

Redirects automatically to `/admin` after login.

---

## Stripe Payments (optional)

Add to Vercel environment variables:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Without these, the app runs in **test mode** — payments are simulated locally.

---

## Tech Stack

| Part | Technology |
|---|---|
| Hosting | Vercel |
| Database | Neon (PostgreSQL) |
| Backend | Express.js |
| Templates | EJS |
| Auth | express-session + bcryptjs |
| Payments | Stripe |
| File uploads | multer |
