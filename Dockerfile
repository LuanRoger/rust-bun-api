# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.9 AS base
WORKDIR /usr/src/app

# Stage 1: Install Rust and build tools for NAPI compilation
FROM base AS rust-builder

# Install Rust and build dependencies
RUN apt-get update && \
    apt-get install -y curl build-essential pkg-config libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

# Add Linux GNU target for NAPI
RUN rustup target add x86_64-unknown-linux-gnu

# Copy workspace files
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/typescript-config/package.json ./packages/typescript-config/

# Copy Rust-specific files
COPY packages/core/Cargo.toml packages/core/Cargo.lock ./packages/core/
COPY packages/core/build.rs ./packages/core/
COPY packages/core/.cargo ./packages/core/.cargo

# Install dependencies with Bun (includes @napi-rs/cli)
RUN bun install --frozen-lockfile

# Copy Rust source code
COPY packages/core/src ./packages/core/src

# Build the native module using NAPI-RS
WORKDIR /usr/src/app/packages/core
RUN bun run build

# Stage 2: Build the application
FROM base AS prerelease

# Copy all project files
COPY . .

# Copy the built native module from rust-builder stage
COPY --from=rust-builder /usr/src/app/packages/core/*.node packages/core/

# Install dependencies in-place so Bun workspace symlinks resolve correctly
RUN bun install --frozen-lockfile

# Build the API
ENV NODE_ENV=production
WORKDIR /usr/src/app/apps/api
RUN bun run build

# Stage 3: Production image
FROM base AS release

# Copy all project files
COPY . .

# Copy the built native module
COPY --from=rust-builder /usr/src/app/packages/core/*.node packages/core/

# Copy built API dist from prerelease
COPY --from=prerelease /usr/src/app/apps/api/dist apps/api/dist

# Install production dependencies only (in-place for correct workspace symlinks)
RUN bun install --frozen-lockfile --production

# Run the app
USER bun
EXPOSE 3000/tcp
WORKDIR /usr/src/app/apps/api
ENTRYPOINT [ "bun", "run", "start" ]
