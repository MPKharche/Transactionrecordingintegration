# Google Cloud Console — local OAuth redirect

Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) and edit **13.05.26 - CursorMCP** (Desktop client in `.env`).

**Authorized redirect URIs** — add:

```
http://localhost:4000/api/auth/google/callback
```

**Authorized JavaScript origins** (recommended):

```
http://localhost:5173
http://localhost:4000
```

Save, then wait ~1 minute before testing sign-in.
