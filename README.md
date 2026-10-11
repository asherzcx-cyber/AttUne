# FocusLab

## What you just added

`server.js` is a small backend. It keeps your Gemini and ElevenLabs keys private, then exposes two safe routes for the website:

- `/api/coach` asks Gemini for a short, non-medical focus suggestion.
- `/api/speak` turns the coach response into audio with ElevenLabs.

## Run it locally

1. Install [Node.js](https://nodejs.org/) if `node --version` does not work in Terminal.
2. In Terminal, move into this folder: `cd ~/Desktop/ADHD\ app`
3. Install the app's packages once: `npm install`
4. Duplicate `.env.example`, name the copy `.env`, and paste in your two API keys.
5. Start the app: `npm run dev`
6. Open `http://localhost:3000` in your browser. Do not open `index.html` directly once you use the APIs.

## Why this is safer

The `.env` file is listed in `.gitignore`, so it is not uploaded when you share your code. Never paste keys into `index.html`, `app.js`, or a GitHub repository.

## Prize-track architecture

- **Tiger Data:** PostgreSQL tables for users, sessions, and high-frequency attention readings.
- **Gemini + ElevenLabs:** private server routes for coaching and voice guidance.
- **Snowflake:** `snowflake.sql` creates a separate analytics workspace for de-identified session summaries.
- **Solana:** `solana-badge.md` describes a devnet completion proof that does not put health data on-chain.
- **Vultr:** `Dockerfile` and `vultr-deploy.md` package the app for deployment.
# AttUne

## Use AttUne on a phone today

AttUne is now an installable Progressive Web App (PWA). It needs a public **HTTPS** link for phone camera access and installation.

1. Deploy the app to Vultr following `vultr-deploy.md`, or use another HTTPS host.
2. Open the resulting `https://` link on the phone.
3. On Android Chrome: use the browser menu and choose **Install app**.
4. On iPhone Safari: choose **Share** then **Add to Home Screen**.
5. Open AttUne from the new home-screen icon and allow camera access when starting Attention Training.

The phone can use its own camera. For a live OpenBCI demo, keep the GUI bridge on the same computer as OpenBCI; direct local UDP EEG streaming does not cross to a phone automatically.

## Connect Cyton+Daisy through the OpenBCI GUI

AttUne accepts **processed band-power data** from the OpenBCI GUI over a local UDP connection. Raw EEG is not sent to AttUne's database.

1. Start AttUne (`npm start`). The terminal should say `OpenBCI UDP bridge listening on 127.0.0.1:12345`.
2. In OpenBCI GUI, connect the Cyton+Daisy and start the system.
3. Open a **Band Power** widget and leave it visible.
4. Open the **Networking** widget. Choose **UDP**, set a stream's data type to **Average Band Power** (or **Band Power**), IP address to `127.0.0.1`, and port to `12345`.
5. Start the UDP stream in the Networking widget, then start the OpenBCI data stream.
6. Return to AttUne Training. Its header changes to `EEG live` within about three seconds. It spends the first few seconds building a personal local baseline before EEG has full influence on the score.

If you need a different port, add `OPENBCI_UDP_PORT=12345` to `.env` (using your chosen number) and use that same port in the OpenBCI GUI.

This is a training feature, not a diagnostic or medical device.
