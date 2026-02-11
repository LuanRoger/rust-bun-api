# Stage 1: Install Rust and build the native NAPI-RS module
FROM oven/bun:1.3.9 AS rust-builder
WORKDIR /usr/src/app

RUN apt-get update && \
    apt-get install -y curl build-essential pkg-config libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

RUN rustup target add x86_64-unknown-linux-gnu

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/typescript-config/package.json ./packages/typescript-config/

COPY packages/core/Cargo.toml packages/core/Cargo.lock ./packages/core/
COPY packages/core/build.rs ./packages/core/
COPY packages/core/.cargo ./packages/core/.cargo

RUN bun install --frozen-lockfile

COPY packages/core/src ./packages/core/src

WORKDIR /usr/src/app/packages/core
RUN bun run build

# Stage 2: Build the JS bundle
FROM oven/bun:1.3.9 AS build
WORKDIR /usr/src/app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN bun install --frozen-lockfile

COPY --from=rust-builder /usr/src/app/packages/core/*.node ./packages/core/

COPY packages/core/index.js packages/core/index.d.ts ./packages/core/
COPY packages/typescript-config ./packages/typescript-config
COPY apps/api ./apps/api

ENV NODE_ENV=production
WORKDIR /usr/src/app/apps/api

RUN bun run compile

# Stage 3: Production image
FROM oven/bun:1.3.9-slim AS release
WORKDIR /usr/src/app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/typescript-config/package.json ./packages/typescript-config/

COPY packages/core/index.js packages/core/index.d.ts ./packages/core/
COPY --from=rust-builder /usr/src/app/packages/core/*.node ./packages/core/

COPY --from=build /usr/src/app/apps/api/dist ./apps/api/dist

RUN bun install --frozen-lockfile --production

USER bun

ENV NODE_ENV=production
EXPOSE 3000/tcp

WORKDIR /usr/src/app/apps/api

ENTRYPOINT ["./dist/compiled/api"]
