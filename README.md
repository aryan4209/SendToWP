# SendToWP

A focused WhatsApp message scheduler built with React, Material UI, Express, SQLite, Baileys, and node-cron.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, then scan the QR code on the Settings page with WhatsApp.

During pairing, keep the server running until the Settings page shows `Connected`. The development watcher ignores WhatsApp credential files so pairing can finish without restarting the server.

If pairing was interrupted or the connection remains stuck, use **Reset & Pair WhatsApp** on Settings to clear the incomplete local session and generate a fresh QR code.

## Production

```bash
npm run build
npm start
```

Set the values in `server/.env` before deployment. Keep `server/whatsapp-auth` private because it contains WhatsApp session credentials.
