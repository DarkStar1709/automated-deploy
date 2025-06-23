# Use the official Node.js 20 LTS image as the base image
FROM node:20-lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev --registry=https://registry.npmjs.org --no-optional

COPY . .

# FROM for runtime image
FROM node:20-lts-alpine

WORKDIR /app

# Optional: ensure tini is available
RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

EXPOSE 3000

ENV NODE_ENV production

ENTRYPOINT ["/sbin/tini", "--", "node", "app.js"]
