# Imágenes del backend (TK-00.6, TK-00.3; docs/ARCHITECTURE.md, "Docker Compose" > "Imágenes").
# Etapas: build -> migrate (target de migraciones) y runtime (imagen final del backend, la última).

# Etapa de build: dependencias completas, cliente de Prisma generado y compilación de src/ a dist/.
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
# El cliente se genera aquí (no se versiona ni se copia del host) y debe existir antes de compilar.
RUN npm run db:generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Target `migrate` (docker-compose.delivery.yml): CLI de Prisma, esquema y migraciones. Nunca es la imagen del backend.
# Con --ignore-scripts el motor de migraciones no se instala: se fuerza su descarga en el build para que
# `migrate` no necesite red al ejecutarse.
FROM build AS migrate
# `prisma migrate deploy` sale con 0 si no encuentra migraciones: se exige al menos una (prisma/migrations/<dir>/migration.sql).
RUN find prisma/migrations -mindepth 2 -maxdepth 2 -type f -name migration.sql 2>/dev/null | grep -q . \
    || { echo "ERROR: no hay migraciones en prisma/migrations/*/migration.sql" >&2; exit 1; }
RUN node_modules/.bin/prisma -v && ls node_modules/@prisma/engines/schema-engine* > /dev/null
USER node
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]

# Etapa final (backend): sin CLI de Prisma ni motor de migraciones (SEC-00.3-01).
# --omit=optional excluye las dependencias devOptional (prisma y su cadena) que --omit=dev deja pasar.
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
