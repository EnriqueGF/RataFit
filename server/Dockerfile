# ── Compilación ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# better-sqlite3 se compila de forma nativa y necesita estas herramientas.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Se reinstalan solo las dependencias de producción, ya compiladas.
RUN npm ci --omit=dev

# ── Imagen final ─────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# El directorio de datos pertenece al usuario sin privilegios con el que
# arranca el proceso: un fallo en la app no puede tocar el resto del sistema.
RUN mkdir -p /data && chown -R node:node /data

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
