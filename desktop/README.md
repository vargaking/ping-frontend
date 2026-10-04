# Zet desktop

A thin Electron shell around the Zet web app. It loads `https://zetchat.app` and adds a tray icon, unread badges, launch at login (Windows, and Linux when run as an AppImage) and a screen share picker.

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

`npm run dist:win` builds the Windows installer into `release/Zet-Setup.exe`. `npm run dist:linux` builds `release/Zet.AppImage`. On GNOME the tray needs the AppIndicator extension; without it, closing the window hides it and launching Zet again brings it back.

## Releasing

Nobody pushes tags. To release a new shell version, bump `version` in `package.json` in your PR.

- Pull requests that touch `desktop/` build the installer and AppImage and upload them as the `zet-windows` and `zet-linux` artifacts (kept 7 days). A PR that changes what ships in the installer without a version bump fails once that version is released.
- On master, the Desktop workflow reads the version. If `desktop-v<version>` doesn't exist yet, it builds both, creates the tag and a GitHub Release at that commit, and attaches `Zet-Setup.exe` and `Zet.AppImage`. If it exists, the run is skipped and says so.
- Run it manually from the Actions tab with "Run workflow". Manual runs only release from master.

The landing page links to `/download/windows` and `/download/linux`, which redirect to `releases/latest/download/Zet-Setup.exe` and `Zet.AppImage`. GitHub's "latest" is per repo, so only desktop releases may be marked latest in this repo.
