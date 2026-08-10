# Deploying SendToWP

## Read this first: why the usual free hosts don't work

SendToWP's backend is not a normal web API. It has three requirements that rule
out most free hosting:

1. **A process that never stops.** Baileys holds a permanent WebSocket to
   WhatsApp. Kill the process and your phone shows the device as disconnected.
2. **A persistent filesystem.** `whatsapp-auth/` is your linked-device session
   and `sendtowp.db` is your data. Lose either and you re-pair from scratch.
3. **No sleeping.** The cron scheduler must be awake at the minute a message is
   due. Nobody is going to send an HTTP request to wake it up at 7:00 AM.

What that eliminates:

| Host | Why it fails |
| --- | --- |
| **Vercel / Netlify functions** | Serverless. No long-lived socket, no disk, execution time limits. Your frontend is fine there; the backend can never be. |
| **Render free** | Free web services [cannot attach a persistent disk](https://render.com/docs/free) and spin down after 15 minutes of no traffic. |
| **Koyeb free** | Free instances [cannot attach volumes and scale to zero after 1 hour](https://www.srvrlss.io/provider/koyeb/), and that cannot be disabled. |
| **Fly.io** | [The permanent free tier ended in 2024](https://www.saaspricepulse.com/blog/flyio-free-tier-2026). |

A keep-alive pinger does not rescue these — the killer is the missing disk, not
just the sleeping. What works is a small always-on VM with a real disk.

---

# Google Cloud, step by step

Google's [Always Free tier](https://docs.cloud.google.com/free/docs/free-cloud-features)
gives you, per month, forever:

- 1 non-preemptible **`e2-micro`** instance (1 GB RAM)
- **30 GB-months** of **standard** persistent disk
- **1 GB** of outbound data transfer from North America
- Only in **`us-west1`** (Oregon), **`us-central1`** (Iowa), or **`us-east1`** (South Carolina)

Every one of those limits is a trap if you miss it. The commands below stay
inside all of them.

## 0. Prerequisites

Create a Google Cloud account and a project, and **enable billing on it** — the
free tier still requires a billing account attached. Then, before anything else:

**Set a budget alert.** Console → Billing → Budgets & alerts → Create budget →
amount **$1**, alert at 100%. This is your safety net for every "oops, that
wasn't free" scenario below.

Install the CLI and sign in (or skip the install and use **Cloud Shell** in the
browser, which has `gcloud` preinstalled):

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable compute.googleapis.com
```

## 1. Create the VM

```bash
gcloud compute instances create sendtowp \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-type=pd-standard \
  --boot-disk-size=30GB \
  --boot-disk-device-name=sendtowp
```

Three flags are doing load-bearing work:

- `--machine-type=e2-micro` — anything else is billed.
- `--boot-disk-type=pd-standard` — **gcloud defaults to `pd-balanced`, which is
  not in the free tier.** This is the single most common way people get a
  surprise bill.
- `--zone=us-central1-a` — must be in one of the three free regions.

**No firewall rules are needed.** The next step uses Cloudflare Tunnel, which
dials out from the VM, so nothing has to be open to the internet.

## 2. Install the app

```bash
gcloud compute ssh sendtowp --zone=us-central1-a
```

Then on the VM:

```bash
curl -fsSL https://raw.githubusercontent.com/aryan4209/SendToWP/main/scripts/gcp-bootstrap.sh | sudo bash
```

[`scripts/gcp-bootstrap.sh`](scripts/gcp-bootstrap.sh) does all of this:

- adds a 2 GB swap file (the Vite build gets OOM-killed on 1 GB without it)
- installs Node 20 and build tools
- clones the repo to `/opt/sendtowp`
- writes `/opt/sendtowp/.env` with a freshly generated `JWT_SECRET`
- builds the client, prunes dev dependencies
- installs a hardened `systemd` unit running as an unprivileged `sendtowp` user,
  with data in `/var/lib/sendtowp` and `Restart=always`
- installs `cloudflared`

Expect **10–20 minutes** — `e2-micro` bursts to 2 vCPU but its baseline is 0.25.
Re-running the same command later pulls, rebuilds, and restarts, so it doubles
as the update command. It never regenerates `JWT_SECRET`, so re-running will not
sign you out.

> **Note on Docker:** the repo has a working [Dockerfile](Dockerfile) and
> [docker-compose.yml](docker-compose.yml), but don't use them on `e2-micro`.
> Building that image on 1 GB of RAM thrashes swap for 20+ minutes. Docker is
> the better choice on a larger box (Oracle Always Free, a Pi 4, a VPS).

## 3. Put HTTPS in front of it

You need real HTTPS: a phone home-screen app will not install over plain HTTP.

**Cloudflare Tunnel** is free, issues a real certificate, needs no open ports and
no external IP exposure. You need a domain on Cloudflare. Don't use a
`trycloudflare.com` quick tunnel — the URL changes on every restart.

On the VM:

```bash
cloudflared tunnel login          # opens a URL; paste it into your browser
cloudflared tunnel create sendtowp
cloudflared tunnel route dns sendtowp wp.yourdomain.com
```

Note the tunnel UUID it prints, then:

```bash
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml >/dev/null <<'EOF'
tunnel: sendtowp
credentials-file: /root/.cloudflared/PASTE_TUNNEL_UUID.json
ingress:
  - hostname: wp.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

`https://wp.yourdomain.com` now serves the app.

<details>
<summary>No domain? Use Caddy with the VM's IP instead</summary>

This is the fallback if you don't want to buy a domain. You'll need to open port
443 and use a hostname — a bare IP cannot get a public certificate, so use a
free wildcard-DNS service:

```bash
gcloud compute firewall-rules create sendtowp-https \
  --allow=tcp:443 --target-tags=sendtowp --source-ranges=0.0.0.0/0
gcloud compute instances add-tags sendtowp --zone=us-central1-a --tags=sendtowp

# on the VM, where 1.2.3.4 is your external IP:
sudo apt install -y caddy
echo '1-2-3-4.sslip.io { reverse_proxy localhost:3000 }' | sudo tee /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Cloudflare Tunnel is still the better option: no open ports, and it works even
if the VM's IP changes.
</details>

## 4. Create your account, then close the door

1. Open `https://wp.yourdomain.com` and **create your account** — the first one
   is always allowed even when registration is closed.
2. Go to **Settings** → scan the QR with WhatsApp → *Linked devices → Link a device*.
3. Shut off public sign-ups:

   ```bash
   sudo sed -i 's|^ALLOW_REGISTRATION=.*|ALLOW_REGISTRATION=false|' /opt/sendtowp/.env
   sudo systemctl restart sendtowp
   ```

**Step 3 is not optional.** Anyone who reaches this URL and registers can send
WhatsApp messages as you.

## 5. Install it on your phone

- **Android / Chrome** — open the site → ⋮ → **Install app**.
- **iOS / Safari** — open the site → Share → **Add to Home Screen**. Must be
  Safari; iOS ignores this from Chrome.

It launches fullscreen with its own icon and no browser bar. The bootstrap
script sets `JWT_EXPIRES_IN=30d`, so you stay signed in for a month.

## 6. Frontend: keep Vercel, or drop it

**Recommended — drop it.** The VM already builds and serves the client, so one
origin covers everything: no CORS, no mixed content, no second deploy, and the
service worker just works. Leave `CLIENT_ORIGIN` empty (the bootstrap already
does) and delete the Vercel project.

**If you want to keep Vercel:** set `VITE_API_URL=https://wp.yourdomain.com/api`
in the Vercel project's environment variables and redeploy, then on the VM set
`CLIENT_ORIGIN=https://your-app.vercel.app` in `/opt/sendtowp/.env` and restart.
It works, but it is strictly more moving parts for no benefit here.

---

## Staying inside the free tier

| Limit | Your usage | Risk |
| --- | --- | --- |
| 1 `e2-micro`, 3 US regions | 1 VM in `us-central1-a` | Fine — just never create a second VM |
| 30 GB standard PD | 30 GB, `pd-standard` | **Only if you passed `--boot-disk-type=pd-standard`** |
| 1 GB/month egress from NA | Roughly 20–50 MB | Fine. The service worker caches the app shell, and API responses are small JSON |

**One thing I could not confirm:** since February 2024 Google
[charges $0.005/hour for an external IPv4 address](https://cloud.google.com/vpc/pricing-announce-external-ips)
on a standard VM — about **$3.65/month**. Google's own Always Free page does not
say whether free-tier `e2-micro` instances are exempt, and secondary sources
claim they are. Treat it as unverified: your $1 budget alert will tell you within
a day or two. If you do get charged and want to avoid it, the fix is to remove
the external IP entirely and reach the VM over
[IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
— Cloudflare Tunnel itself needs no inbound IP, but the VM would then need Cloud
NAT for outbound traffic, which is also billed. At that point Oracle Always Free
is the cheaper escape hatch.

Also worth knowing: Google may **stop** an Always Free VM that it considers idle,
and the free tier does not include automatic backups.

## Operating it

```bash
sudo journalctl -u sendtowp -f                 # tail logs
sudo systemctl restart sendtowp                # restart
sudo systemctl status sendtowp                 # health

# update to the latest code (safe to re-run; keeps your secret and data)
curl -fsSL https://raw.githubusercontent.com/aryan4209/SendToWP/main/scripts/gcp-bootstrap.sh | sudo bash
```

**Back up your data** — this is the WhatsApp session and every scheduled
message, and the free tier has no snapshots:

```bash
sudo tar czf ~/sendtowp-backup-$(date +%F).tgz -C /var/lib/sendtowp .
gcloud compute scp sendtowp:~/sendtowp-backup-*.tgz . --zone=us-central1-a
```

## Things that will bite you eventually

- **WhatsApp may ban the account.** This is an unofficial client driving your
  personal number. Bulk or unsolicited sending is exactly what gets flagged.
  Keep the volume low and message people expecting to hear from you.
- **The session expires.** If WhatsApp unlinks the device, the dashboard warns
  you and Settings offers a fresh QR. Scheduled messages are held, not failed,
  while that's true.
- **1 GB of RAM is not much.** If the service dies, check
  `journalctl -u sendtowp -n 50` for an OOM kill and confirm `swapon --show`
  lists `/swapfile`.
- **Nothing here is high-availability.** One VM, one disk, no failover.

---

Sources: [GCP Always Free features](https://docs.cloud.google.com/free/docs/free-cloud-features) ·
[GCP external IP pricing change](https://cloud.google.com/vpc/pricing-announce-external-ips) ·
[Render free tier](https://render.com/docs/free) ·
[Koyeb free tier](https://www.srvrlss.io/provider/koyeb/) ·
[Fly.io free tier status](https://www.saaspricepulse.com/blog/flyio-free-tier-2026) ·
[Oracle Always Free 2026 changes](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/)
