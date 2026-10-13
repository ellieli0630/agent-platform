FROM oven/bun:1.3.14
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY client ./client
COPY server ./server
COPY migrations ./migrations
COPY skills ./skills
ENV NODE_ENV=production PORT=3100
USER bun
EXPOSE 3100
CMD ["bun", "server/index.ts"]
