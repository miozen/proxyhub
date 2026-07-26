FROM node:22-alpine AS dependencies

WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini \
    && addgroup -S proxyhub \
    && adduser -S -G proxyhub proxyhub \
    && mkdir -p /app/data \
    && chown -R proxyhub:proxyhub /app \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

COPY --from=dependencies --chown=proxyhub:proxyhub /app/node_modules ./node_modules
COPY --chown=proxyhub:proxyhub package*.json ./
COPY --chown=proxyhub:proxyhub src ./src

USER proxyhub
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]





