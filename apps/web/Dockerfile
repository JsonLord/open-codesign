FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @open-codesign/web...

COPY apps/web apps/web
COPY packages/runtime packages/runtime
COPY packages/shared packages/shared
RUN pnpm --filter @open-codesign/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=7860
ENV CODESIGN_DATA_DIR=/data
WORKDIR /app/apps/web

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/dist-server ./dist-server

RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 7860
VOLUME ["/data"]

CMD ["node", "dist-server/server/index.js"]
