FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY backend backend
RUN npm run build -w backend

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/catalog ./catalog
COPY --from=build /app/backend/sql ./sql
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/tsconfig.json ./tsconfig.json
COPY imagens ./imagens

EXPOSE 3000
CMD ["node", "dist/main.js"]
