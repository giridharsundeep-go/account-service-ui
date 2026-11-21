FROM docker:cli AS docker-client

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git skopeo \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker-client /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-client /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
# Use dist/build-center from npm run build:build-center as the build context.
COPY --chown=node:node . ./
USER node
ENV PORT=4212 NODE_ENV=production
EXPOSE 4212
CMD ["node", "server/server.mjs"]
