import type { BuildRecipe } from './models';

const angularBuilder = `FROM node:24-bookworm-slim AS build
ARG ANGULAR_APP_DIRECTORY=app
WORKDIR /workspace/\${ANGULAR_APP_DIRECTORY}
COPY . .
ENV NG_BUILD_MAX_WORKERS=1 NG_BUILD_PARALLEL_TS=0
RUN <<'LOCK' node
const fs = require('node:fs');
const filename = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(filename, 'utf8'));
let changed = false;
for (const name of ['design-system', 'suite']) {
  const packageName = '@greatley-poshley/' + name;
  const target = 'vendor/' + name;
  const link = lock.packages?.['node_modules/' + packageName];
  if (!link?.link || link.resolved !== target || lock.packages[target]) continue;
  const manifest = JSON.parse(fs.readFileSync(target + '/package.json', 'utf8'));
  if (manifest.name !== packageName) throw new Error('Unexpected vendored package at ' + target);
  const { version, dependencies, optionalDependencies, peerDependencies, peerDependenciesMeta } = manifest;
  lock.packages[target] = { name: packageName, version, dependencies, optionalDependencies, peerDependencies, peerDependenciesMeta };
  changed = true;
}
if (changed) fs.writeFileSync(filename, JSON.stringify(lock, null, 2) + '\\n');
LOCK
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
ARG ANGULAR_CONFIGURATION=production
ARG ANGULAR_API_BASE_URL
RUN <<'API' node
const value = process.env.ANGULAR_API_BASE_URL;
if (value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('ANGULAR_API_BASE_URL must be an HTTPS API URL without credentials, query, or fragment.');
  }
  const fs = require('node:fs');
  const file = 'src/environment.ts';
  const source = fs.readFileSync(file, 'utf8');
  const property = /^([ \\t]*apiBaseUrl[ \\t]*:[ \\t]*)['"][^'"\\r\\n]+['"]/gm;
  if ([...source.matchAll(property)].length !== 1) throw new Error('Expected one apiBaseUrl string in src/environment.ts.');
  fs.writeFileSync(file, source.replace(property, (_, prefix) => prefix + JSON.stringify(value)));
}
API
RUN npm run build -- --configuration="$ANGULAR_CONFIGURATION" --output-path=/output
`;

const staticAngular = `${angularBuilder}
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /output/browser/ /usr/share/nginx/html/
USER root
RUN printf 'server { listen 8080; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }\\n' > /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
`;

const serverAngular = `${angularBuilder}
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /output/ ./
USER node
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/server.mjs"]
`;

const agentRuntime = `FROM python:3.14-slim
WORKDIR /app
RUN useradd --system --uid 10001 --create-home app \
    && install -d -o app -g app -m 700 /data \
    && apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=app:app *.py ./
USER app
ENV GP_AGENT_DATA=/data GP_AGENT_PORT=8092 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8092
CMD ["python", "runtime.py"]
`;

// Gradle's published wrapper checksum for 9.8.2.
const gradleWrapper = 'ADD --checksum=sha256:3b8a25775a69158b5ad2b1d17a80a88dc7b40a352a73eb27d06c612a7ce68e98 ' +
  'https://raw.githubusercontent.com/gradle/gradle/v9.8.2/gradle/wrapper/gradle-wrapper.jar gradle/wrapper/gradle-wrapper.jar\n';

export function managedDockerfile(recipe: BuildRecipe, repositoryDockerfile = '', wrapperMissing = false): string {
  switch (recipe) {
    case 'angular-static': return staticAngular;
    case 'angular-ssr': return serverAngular;
    case 'agent-runtime': return agentRuntime;
    case 'gradle-mirror': {
      const buildLine = /^RUN (chmod \+x gradlew && \.\/gradlew\b)/m;
      if (!buildLine.test(repositoryDockerfile)) throw new Error('The Dockerfile does not match the Gradle build recipe.');
      const argument = /^ARG INSTRU_MAVEN_URL(?:[ =]|$)/m.test(repositoryDockerfile) ? '' : 'ARG INSTRU_MAVEN_URL\n';
      return repositoryDockerfile.replace(buildLine,
        `${wrapperMissing ? gradleWrapper : ''}${argument}RUN --mount=type=cache,target=/root/.gradle,sharing=locked $1`);
    }
    default: return repositoryDockerfile;
  }
}
