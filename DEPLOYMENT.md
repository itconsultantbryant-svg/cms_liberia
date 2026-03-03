# Deploying to Render

This app is set up for a **single Web Service** on Render: the backend serves the API and the built React frontend.

## Option A: Deploy with Blueprint (recommended)

1. Push this repo to GitHub/GitLab.
2. In [Render Dashboard](https://dashboard.render.com), click **New** → **Blueprint**.
3. Connect the repo and confirm the `render.yaml` settings.
4. Add environment variables in the service **Environment** tab:
   - **JWT_SECRET** (required): set a long random string, or use “Generate” in Render.
   - **NODE_ENV**: `production` (usually set by the blueprint).
   - **DATABASE_PATH** (optional): only if you attach a [Persistent Disk](https://render.com/docs/disks) for SQLite, e.g. `/opt/render/project/data/database.sqlite`.
5. Deploy. Render will run `npm run build` then `npm start`.

## Option B: Manual Web Service

1. **New** → **Web Service**.
2. Connect your repo.
3. Use:
   - **Runtime**: Node.
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Root Directory**: leave blank (uses repo root).
4. Add env vars: `NODE_ENV=production`, `JWT_SECRET=<your-secret>`.
5. (Optional) Add a **Persistent Disk** and set `DATABASE_PATH` to the mount path so SQLite data survives deploys.

## Build and start behavior

- **Build** (from repo root): installs frontend deps, builds React (`frontend/build`), installs backend deps, runs `init-db` and `migrate`.
- **Start**: runs `node server.js` in `backend`. In production the server serves the React app from `frontend/build` and the API under `/api`.

## Health check

Render uses **Health Check Path**: `/api/health`. The app responds with `{ "status": "ok" }` when up.

## SQLite and data persistence

- Without a persistent disk, the SQLite file lives in the service filesystem and **is reset on each deploy**.
- For production data, attach a **Persistent Disk** in the service, set `DATABASE_PATH` to the path Render gives (e.g. `/opt/render/project/data/database.sqlite`), and re-run the build so the DB is created/migrated on that path (or run init/migrate once manually via a one-off job if your disk is empty).

## First login

After the first deploy, open the app URL and **register** the first user (e.g. from `/register`). The first registered branch becomes the admin (President). Then log in and create other users/roles as needed.
