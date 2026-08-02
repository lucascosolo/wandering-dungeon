# Multi-stage: the toolchain builds, nginx serves. Nothing from the build stage
# reaches production — no node, no node_modules, no source.
FROM node:20-alpine AS build
WORKDIR /app

# Lockfile first so the install layer survives a source-only change.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# .git is not in the build context, so vite.config's git lookup would fall back
# to a timestamp. The deploy passes the real sha so the stamp a tester copies
# names a commit.
ARG BUILD_ID=""
ENV BUILD_ID=$BUILD_ID

# `npm run build` is tsc --noEmit && vite build, so a type error fails the image
# rather than shipping a broken bundle.
RUN npm run build

FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
