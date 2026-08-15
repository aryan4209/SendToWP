/**
 * Pairs WhatsApp and stores the session in the database.
 *
 * Serverless hosts cannot complete pairing: the QR is produced inside a
 * function instance that is frozen as soon as it responds, so the socket dies
 * before anyone can scan it. This script holds a real socket open locally,
 * writes the session into the same database the deployment uses, and exits once
 * WhatsApp confirms the link.
 *
 *   DATABASE_URL=postgres://... AUTH_STORE=database node scripts/pair-whatsapp.js
 *
 * Nothing about the deployment needs to change afterwards - it reads the
 * session from the database on its next invocation.
 */
process.env.AUTH_STORE = process.env.AUTH_STORE || "database";

const fs = require("fs");
const path = require("path");
const os = require("os");

const { initialize, get, close } = require("../server/database");
const runtime = require("../server/config/runtime");
const whatsappService = require("../server/services/whatsappService");

const outputFile =
  process.env.QR_OUTPUT || path.join(os.homedir(), "Desktop", "whatsapp-qr.png");

const TIMEOUT_MS = Number(process.env.PAIR_TIMEOUT_MS || 5 * 60 * 1000);

const writeQr = (dataUrl) => {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(outputFile, Buffer.from(base64, "base64"));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  await initialize();
  console.log(`storage : ${runtime.dialect}`);
  console.log(`session : ${runtime.authStore}`);

  if (runtime.authStore !== "database") {
    console.warn("\nWARNING: AUTH_STORE is not 'database'. The session will be written to disk");
    console.warn("and your deployment will not see it.\n");
  }

  const existing = await get(`SELECT "Key" FROM "WhatsAppAuth" WHERE "Key" = 'creds'`);
  if (existing && !process.env.FORCE_REPAIR) {
    console.log("\nA session already exists in this database.");
    console.log("Set FORCE_REPAIR=1 to discard it and pair again.");
    await close();
    process.exit(0);
  }

  console.log("\nConnecting to WhatsApp...\n");
  whatsappService.connect().catch((error) => console.error("connect error:", error.message));

  const deadline = Date.now() + TIMEOUT_MS;
  let announced = false;

  while (Date.now() < deadline) {
    const { status } = whatsappService.getStatus();

    if (status === "Connected") {
      console.log("\n=========================================");
      console.log("  PAIRED. Session saved to the database.");
      console.log("=========================================\n");

      const rows = await get(`SELECT COUNT(*) AS "Count" FROM "WhatsAppAuth"`);
      console.log(`WhatsAppAuth rows written: ${rows.Count}`);

      // Give Baileys a moment to flush the final key updates before exiting.
      await sleep(4000);
      const after = await get(`SELECT COUNT(*) AS "Count" FROM "WhatsAppAuth"`);
      console.log(`after flush              : ${after.Count}`);

      fs.rmSync(outputFile, { force: true });
      await whatsappService.disconnect();
      await close();
      process.exit(0);
    }

    const qr = whatsappService.getQr();
    if (qr && !announced) {
      writeQr(qr);
      console.log("=========================================");
      console.log("  QR CODE SAVED TO:");
      console.log(`  ${outputFile}`);
      console.log("=========================================");
      console.log("\n  Open that file, then on your phone:");
      console.log("    WhatsApp -> Settings -> Linked devices");
      console.log("    -> Link a device -> scan it\n");
      console.log("  The image refreshes automatically if the code expires.");
      console.log("  Waiting...\n");
      announced = true;
    } else if (qr) {
      writeQr(qr); // the code rotates every ~20s; keep the file current
    }

    await sleep(1500);
  }

  console.error("\nTimed out waiting for the scan.");
  await whatsappService.disconnect();
  await close();
  process.exit(1);
};

main().catch(async (error) => {
  console.error("\nPairing failed:", error);
  await close().catch(() => {});
  process.exit(1);
});
