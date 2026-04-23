# syntax=docker/dockerfile:1

# ─── deps ──────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false

# ─── build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/data/nudge.db

# non-root user
RUN addgroup -g 1001 -S nudge && adduser -u 1001 -S nudge -G nudge

# standalone server + static assets
COPY --from=build --chown=nudge:nudge /app/.next/standalone ./
COPY --from=build --chown=nudge:nudge /app/.next/static ./.next/static
COPY --from=build --chown=nudge:nudge /app/public ./public

# data dir mounted by compose; create + chown so first boot can write
RUN mkdir -p /data && chown -R nudge:nudge /data

USER nudge
EXPOSE 3000
CMD ["node", "server.js"]
