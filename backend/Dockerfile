# Stage 1: build — full dependency tree, compiles TypeScript into dist/
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Stage 2: production — production dependencies and the compiled dist/ only
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=optional: typeorm's optional peer ts-node would otherwise pull typescript and swc into the
# image; the only other optional packages are a native msgpack speed-up (pure-JS fallback) and pg-cloudflare
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Run migrations as a separate step before rollout: npm run migration:run:prod
CMD ["node", "dist/main.js"]
