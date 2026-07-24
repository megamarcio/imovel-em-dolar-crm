# build do frontend
FROM node:20-slim AS client
WORKDIR /app/client
COPY client/package.json ./
RUN npm install --no-audit --no-fund
COPY client ./
RUN npm run build

# runtime
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=client /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
