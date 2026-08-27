FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile --filter @open-codesign/web...

COPY apps/web apps/web
COPY packages/runtime packages/runtime
COPY packages/shared packages/shared
COPY packages/providers packages/providers
RUN pnpm --filter @open-codesign/web build
RUN pnpm --config.inject-workspace-packages=true --filter @open-codesign/web deploy --prod /deploy

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=7860
ENV CODESIGN_PROJECTS_DIR=/app
WORKDIR /opt/open-codesign

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/dist-server ./dist-server
COPY --from=build /deploy/node_modules ./node_modules

RUN mkdir -p /app && chown -R node:node /app /opt/open-codesign
USER node
EXPOSE 7860
VOLUME ["/app"]

CMD ["node", "dist-server/index.js"]
