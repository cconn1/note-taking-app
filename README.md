# Lists

Personal meeting notes and to-dos that sync across iPad, iPhone, Mac and Windows.
React + Vite + TypeScript + Tailwind, with Supabase for sign-in and storage. Hosted on GitHub Pages.

## How it works

The app is a set of static files. Each browser talks directly to Supabase:

- **Auth**: you sign in with a 6-digit code (or the link) from your email. Supabase gives the browser a signed token (JWT) with your user id.
- **Postgres + Row Level Security (RLS)**: every query carries that token, and policies like `user_id = auth.uid()` mean you can only see and change your own rows.
- **Sync**: each device reloads data when the app opens or comes back into focus. If two devices edit the same session's notes, the second save is detected (per-field `*_updated_at` check) and you choose **Reload** or **Keep mine**.

### Why the anon key is safe to publish

`VITE_SUPABASE_ANON_KEY` (the "publishable" key) only identifies the project. Requests made with it run as the `anon` or `authenticated` role, and RLS decides what each row is visible to. Without a valid sign-in token, RLS returns nothing. The key ends up in the JavaScript bundle anyway, so security comes from RLS, not from hiding the key.
**Never** put the `service_role` / secret key in this app. It bypasses RLS.

## Supabase setup (one time)

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard) → New project (Free plan). Save the database password. Pick the nearest region.
2. **Create the tables**: SQL Editor → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run. Then check Table Editor: you should see `pages` and `tasks`, both marked RLS enabled.
3. **Get the keys**: Project Settings → API Keys. Copy the **Project URL** and the **publishable key** (or the legacy **anon** key).
4. **Redirect URLs**: Authentication → URL Configuration.
   - Site URL: `http://localhost:5173` for now. After deploying, change it to `https://<user>.github.io/<repo>/`.
   - Redirect URLs: add `http://localhost:5173/**` and `https://<user>.github.io/<repo>/**`.
5. **Put the code in the emails**: Authentication → Emails → Templates. In both **Magic Link** and **Confirm signup** (your first sign-in uses Confirm signup), add a line such as:
   ```html
   <p>Your code: <strong>{{ .Token }}</strong></p>
   ```
   Keep the existing link. The code is what you'll use in the installed iPhone/iPad app, because a tapped link opens in Safari, not in the app.
6. **Sign in once** (see Local development), then lock the door: Authentication → Sign In / Providers → turn off **Allow new users to sign up**.

> **Free-tier pausing:** Supabase pauses free projects after about 7 days without activity. Daily use keeps it awake. If it does pause, open the project in the dashboard and click **Restore**. Your data is kept.

## Local development

Requires Node 20+.

```sh
npm install
cp .env.example .env.local   # then fill in the URL and key from step 3
npm run dev                  # http://localhost:5173
```

`.env.local` is gitignored. Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Deployment

GitHub Pages via GitHub Actions. Coming in Phase 5.
