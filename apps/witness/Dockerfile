FROM oven/bun:1.4-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --production --filter witness

WORKDIR /app/apps/witness

CMD ["bun", "run", "src/index.ts"]
