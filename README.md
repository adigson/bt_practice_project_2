# Login demo

This Express app has username-or-email login, account registration, and logout.
User accounts and sessions are stored in SQLite. Passwords are hashed with
bcrypt; they are never stored as plain text.

## Run locally

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Start the app with `npm start` and open `http://localhost:3000`.

In development, the app creates this demo account on first launch:

- Username: `demo`
- Password: `DemoPass123!`

The demo account is only seeded outside production and test environments. If
you already have a `demo` account in the database, its existing password is not
changed.

New registrations require a name, a unique username and email address, and a
password of at least 12 characters. The login is rate-limited. SQLite stores
accounts in `data/auth.sqlite` by default; set `AUTH_DB_PATH` to choose another
location.

## Production

Set `NODE_ENV=production` and configure `SESSION_SECRET` with a securely
generated random value of at least 32 characters. Use HTTPS so session cookies
can be sent securely, and keep the SQLite database and its backups private.
Do not use the published demo credentials for a production account.
