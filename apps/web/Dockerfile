FROM oven/bun:1.4-alpine AS build

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

ARG VITE_RPC_URL
ENV VITE_RPC_URL=${VITE_RPC_URL}

RUN bun run --filter web build

FROM caddy:2-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
