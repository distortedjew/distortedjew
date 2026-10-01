# syntax=docker/dockerfile:1

# ---- deps: install all packages (the custom server runs TypeScript via tsx,
# and Prisma's CLI is needed for migrations at startup) ----------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Prisma's query engine links against the system OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build: compile the Next.js app ------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, and
# APP_URL feeds the static metadata (Open Graph URLs), so both come in as
# build args. Nothing secret belongs here.
ARG APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_CAPTCHA_SITE_KEY=
ARG NEXT_PUBLIC_ADSENSE_CLIENT=
ARG NEXT_PUBLIC_ADSENSE_SLOT_LANDING=
ARG NEXT_PUBLIC_ADSENSE_SLOT_GAMES=
ARG NEXT_PUBLIC_AD_PLACEHOLDERS=false
ENV APP_URL=$APP_URL \
    NEXT_PUBLIC_CAPTCHA_SITE_KEY=$NEXT_PUBLIC_CAPTCHA_SITE_KEY \
    NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT \
    NEXT_PUBLIC_ADSENSE_SLOT_LANDING=$NEXT_PUBLIC_ADSENSE_SLOT_LANDING \
    NEXT_PUBLIC_ADSENSE_SLOT_GAMES=$NEXT_PUBLIC_ADSENSE_SLOT_GAMES \
    NEXT_PUBLIC_AD_PLACEHOLDERS=$NEXT_PUBLIC_AD_PLACEHOLDERS \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- runtime ------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Prisma's query engine links against the system OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src ./src
COPY --chown=node:node deploy/entrypoint.sh /usr/local/bin/wisp-entrypoint
RUN chmod +x /usr/local/bin/wisp-entrypoint \
  && mkdir -p /app/public/uploads && chown node:node /app/public/uploads

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run with an init process (compose: `init: true`) so signals reach the app.
ENTRYPOINT ["/usr/local/bin/wisp-entrypoint"]
