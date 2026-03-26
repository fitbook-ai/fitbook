# FitBook — Class Booking Software for Fitness Studios

Simple, fast, no-nonsense booking software for spin studios, yoga studios, gyms,
and boutique fitness businesses. Built to replace Mindbody for studios that don't
need enterprise complexity.

---

## Features

**For studio owners**
- Weekly calendar schedule view — create single or recurring classes
- Member management with search, membership types, and credit packs
- Live attendance tracking and check-in at the front desk
- Dashboard with fill rates, new members, upcoming classes
- Configurable booking windows and cancellation policies
- Waitlist management with automatic promotion

**For members**
- Clean booking page at `/book/your-studio` — no app download needed
- Self-register and log in, view schedule, book or cancel in one tap
- Waitlist joining with automatic notification when a spot opens

---

## Tech stack

- **Runtime**: Node.js 22+ (uses built-in SQLite — zero npm dependencies)
- **Database**: SQLite via `node:sqlite` (file: `fitbook.db`)
- **Auth**: JWT (HS256) + scrypt password hashing — all Node built-ins
- **Frontend**: Vanilla JS ES modules, no framework, no build step

---

## Quick start

```bash
# Requires Node.js 22 or later
node --version  # must be >= 22.0.0

# Start the server
node server.js

# Or with auto-restart on changes (development)
node --watch server.js
```

Open `http://localhost:3000` and create your studio account.

Your member booking page will be at:
`http://localhost:3000/book/your-studio-slug`

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | dev secret | **Change in production!** |
| `SMTP_HOST` | — | SMTP server for email notifications |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `FROM_EMAIL` | `noreply@fitbook.app` | From address for notifications |

Set these in your environment or a `.env` file (load with `--env-file .env`):
```bash
node --env-file .env server.js
```

---

## Production deployment

### On a VPS (Ubuntu/Debian)

```bash
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Clone / copy app files
mkdir /opt/fitbook && cd /opt/fitbook
# copy all files here

# Run with PM2 for process management
npm install -g pm2
pm2 start server.js --name fitbook
pm2 startup && pm2 save

# Nginx reverse proxy (recommended)
# /etc/nginx/sites-available/fitbook:
#   server {
#     listen 80;
#     server_name yourdomain.com;
#     location / { proxy_pass http://localhost:3000; }
#   }
```

### Security checklist before going live
- [ ] Set `JWT_SECRET` to a strong random string (32+ chars)
- [ ] Put the app behind Nginx or Caddy with HTTPS/TLS
- [ ] Set up regular SQLite backups (`cp fitbook.db fitbook.db.bak`)
- [ ] Configure SMTP credentials for email notifications
- [ ] Consider `--disallow-code-generation-from-strings` Node flag

---

## File structure

```
fitbook/
├── server.js              # HTTP server + routing
├── lib/
│   ├── db.js              # SQLite schema + query helpers
│   ├── auth.js            # JWT + password hashing
│   └── email.js           # Email notifications (SMTP)
├── routes/
│   ├── auth.js            # Register/login (owners + members)
│   ├── classes.js         # Class templates + sessions + instructors
│   ├── bookings.js        # Bookings, waitlist, check-in
│   ├── members.js         # Member CRUD + credits
│   └── dashboard.js       # Stats + studio settings
└── public/
    ├── index.html         # Owner portal shell
    ├── portal.html        # Member booking portal shell
    ├── css/main.css       # Full design system
    └── js/
        ├── api.js         # Shared API client + utilities
        ├── app.js         # Owner SPA router + auth pages
        ├── member-portal.js  # Member booking portal
        └── owner/
            ├── dashboard.js
            ├── schedule.js
            ├── members.js
            └── settings.js
```

---

## API reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create studio + owner account |
| POST | `/api/auth/login` | Owner login |
| POST | `/api/auth/member/register` | Member self-registration |
| POST | `/api/auth/member/login` | Member login |

### Classes & Schedule
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/classes` | List class templates |
| POST | `/api/classes` | Create template + generate sessions |
| GET | `/api/sessions?from=&to=` | List sessions in date range |
| GET | `/api/sessions/:id` | Session detail with bookings |
| PUT | `/api/sessions/:id` | Edit session |
| DELETE | `/api/sessions/:id` | Cancel session (refunds credits) |
| GET | `/api/instructors` | List instructors |
| POST | `/api/instructors` | Add instructor |

### Bookings
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/bookings` | Book member into session (owner) |
| DELETE | `/api/bookings/:id` | Cancel booking |
| POST | `/api/bookings/:id/checkin` | Check in member |
| GET | `/api/my-bookings` | Member's upcoming bookings |
| POST | `/api/public/book` | Member self-book |
| POST | `/api/public/cancel` | Member self-cancel |
| GET | `/api/public/sessions?studio=` | Public schedule (no auth) |

### Members
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/members` | List members (supports `?q=search`) |
| POST | `/api/members` | Add member |
| GET | `/api/members/:id` | Member detail + history |
| PUT | `/api/members/:id` | Update member info |
| DELETE | `/api/members/:id` | Deactivate member |
| PUT | `/api/members/:id/membership` | Update membership type + credits |
| POST | `/api/members/:id/credits` | Adjust credit balance |

### Dashboard & Settings
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Stats, today's classes, recent members |
| GET | `/api/studio` | Studio settings |
| PUT | `/api/studio` | Update studio settings |
| GET | `/api/me` | Current user/member profile |

---

## Adding Stripe payments (next step)

The codebase is built to accept Stripe easily:

1. Add `stripe_pk` and `stripe_sk` to the `studios` table (columns already exist)
2. In `routes/members.js`, create a Stripe customer on member creation
3. For membership billing, use `stripe.subscriptions.create()`
4. For class pack purchases, use `stripe.paymentIntents.create()`
5. Add a `/api/stripe/webhook` route to handle `invoice.payment_succeeded`

Recommended: use [Stripe's Node SDK](https://github.com/stripe/stripe-node) — `npm install stripe`

---

## License

MIT — do whatever you want with it.
