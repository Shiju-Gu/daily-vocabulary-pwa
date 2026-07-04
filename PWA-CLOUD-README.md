# Daily Vocabulary PWA and Cloud API

This folder can still run locally:

```powershell
npm start
```

It is also ready to deploy as a small cloud app. The same endpoints stay available:

- `/api/meaning?word=example`
- `/api/pronunciation?word=example`
- `/api/audio?word=example`

Recommended first deployment path:

1. Create a Vercel project from this folder.
2. Use the default Node.js runtime.
3. Deploy the static files plus the `api/[...path].js` serverless route.
4. Open the HTTPS URL on iPhone Safari.
5. Use Share > Add to Home Screen to install it as a PWA.

Important notes:

- The app data is still stored on the device in browser storage.
- Use `Export` before moving devices or clearing browser data.
- Use `Import` to merge a JSON backup into the current device.
- Dictionary lookup and pronunciation now use the same API shape locally and in the cloud.
