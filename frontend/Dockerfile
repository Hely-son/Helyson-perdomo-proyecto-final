# Imagen de entrega del frontend (TK-00.6; docs/ARCHITECTURE.md, "Docker Compose" > "Imágenes").

# Etapa de build: dependencias del lockfile y build de Vite.
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
# Valor fijo, sin ARG (D.2 #11 B). No es un secreto: se incrusta en el bundle.
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

# Etapa final: Nginx con solo el build estático y su configuración.
FROM nginx:1.30.7-alpine@sha256:bef154735288bc38d99fac41ae63730684bcc661503673a04a0f9bc526ba8598 AS runtime
RUN rm -rf /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
