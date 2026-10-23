FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
# The run store lives on a volume mounted at /data; create it owned by the unprivileged user so a
# fresh named volume inherits that ownership.
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3000 COFORGE_APP_DATA_DIR=/data
EXPOSE 3000
CMD ["node", "src/server.js"]
