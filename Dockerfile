FROM oven/bun:1.4.0 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM mcr.microsoft.com/playwright:v1.60.0-noble
COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

ENV HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000
CMD ["bun", "src/index.ts"]
