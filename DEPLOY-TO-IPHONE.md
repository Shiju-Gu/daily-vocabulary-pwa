# Deploy and Test on iPhone

## Fastest cloud path

1. Put this folder in a GitHub repository.
2. Go to Vercel and create a new project from that repository.
3. Use this folder as the project root.
4. Keep the default build settings. There is no build command.
5. Deploy.
6. Open the HTTPS Vercel URL on iPhone Safari.
7. Tap Share, then Add to Home Screen.

## What to test on iPhone

- Add a new word.
- Tap the US pronunciation button for a single word.
- Hover does not exist on iPhone, so use Reveal Meaning.
- Change word status with the color buttons.
- Export your words before clearing browser data or switching devices.
- Import the exported JSON backup on the new device.

## If frontend and API are hosted separately

Add this before `app.js` in `index.html`:

```html
<script>
  window.VOCABULARY_API_BASE = "https://your-api-domain.example";
</script>
```

If the app and API are on the same Vercel project, no extra configuration is needed.
