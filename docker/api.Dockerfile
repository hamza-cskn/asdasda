FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api

RUN npm run build -w @asys/contracts \
  && npm run prisma:generate -w @asys/api \
  && npm run build -w @asys/api
COPY apps/api/prisma apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
