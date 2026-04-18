# syntax=docker/dockerfile:1
FROM oven/bun:1.1-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R bun:bun /app

USER bun
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz > /dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
