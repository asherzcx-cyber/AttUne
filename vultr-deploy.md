# Deploy AttUne to Vultr

1. Create a Vultr Cloud Compute instance running Ubuntu 24.04, add your domain's DNS A record to its IP address, then copy this project onto it.
2. Add production values for `DATABASE_URL`, `SESSION_SECRET`, Gemini, and ElevenLabs in a server-side `.env` file. Never put them in browser files.
3. Build and run the HTTPS-ready deployment:

```bash
docker compose -f compose.vultr.yml up -d --build
```

4. Replace `attune.example.com` in `Caddyfile` with your real domain before deploying. Caddy requests and renews HTTPS automatically. Confirm the deployment at `https://your-domain/api/health`.

Vultr hosts the web app; Tiger Data hosts PostgreSQL time-series data; Snowflake can hold de-identified analytics exports.

## OpenBCI demo note

The OpenBCI GUI's UDP stream is local. For the hackathon demo, run AttUne on the same Mac as OpenBCI GUI so both use `127.0.0.1:12345`. A Vultr-hosted web app cannot receive a UDP stream addressed to your Mac's loopback address. Use Vultr for the public dashboard/deployment story, or add a secured future gateway before sending EEG across a network.
