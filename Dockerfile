# syntax=docker/dockerfile:1

# ---- build: install everything, build the client, drop dev dependencies ----
FROM node:20-bookworm-slim AS build

# sqlite3 ships prebuilt binaries for most platforms but falls back to a source
# build (notably on arm64), which needs a toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# `npm ci` refuses to run when package.json and package-lock.json disagree.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build -w client \
  && npm prune --omit=dev \
  && rm -rf client/src client/index.html client/vite.config.js client/package-lock.json

# ---- runtime ----
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/sendtowp.db \
    WHATSAPP_AUTH_PATH=/data/whatsapp-auth

WORKDIR /app

# /data holds the SQLite database and the WhatsApp session. Mount a volume here
# or you will re-scan the pairing QR after every restart.
RUN mkdir -p /data && chown -R node:node /data

COPY --from=build --chown=node:node /app ./

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/app.js"]
