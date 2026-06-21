FROM node:24-bookworm-slim AS base

WORKDIR /project

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
