# Google Cloud Console — OAuth setup

Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).

Create **OAuth 2.0 Client ID** → Application type: **Web application**.

## Authorized redirect URIs

Add every environment where users sign in:

**Local dev (Vite proxy — recommended):**
```
http://localhost:5173/api/auth/google/callback
```

**Local dev (API direct):**
```
http://localhost:4000/api/auth/google/callback
```

**Production (Vercel frontend with `/api` rewrite to VPS):**
```
https://ca-suite-web.vercel.app/api/auth/google/callback
```

**Production (custom domain):**
```
https://YOUR_DOMAIN/api/auth/google/callback
```

Optional override: set `GOOGLE_REDIRECT_URI` in API `.env` if you use a non-standard URL.

## Authorized JavaScript origins

```
http://localhost:5173
https://ca-suite-web.vercel.app
```

## API server `.env`

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
WEB_ORIGIN=https://ca-suite-web.vercel.app
GOOGLE_ALLOW_AUTO_JOIN=true   # first-time bootstrap only; set false after admin exists
```

Save in Google Console, wait ~1 minute, then test **Continue with Google** on `/login`.
