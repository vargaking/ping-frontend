# Zet desktop

A thin Electron shell around the Zet web app. It loads `https://zetchat.app` and adds a tray icon, unread badges, launch at login and a screen share picker.

```
npm install
npm start
```

To point it at staging or a preview, pass `--url=` or set `ZET_URL`:

```
npm start -- --url=https://localhost:5173
ZET_URL=https://preview.example.com npm start
```

`npm run icons` regenerates `assets/` from the web app's logo files.

`npm run dist:win` builds the Windows installer into `release/`. Pushing a `desktop-v<version>` tag, matching the version in `package.json`, builds it in CI and attaches it to a GitHub Release.
