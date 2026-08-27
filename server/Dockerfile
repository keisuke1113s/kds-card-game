# KDS対戦サーバー。build context はリポジトリルートにすること:
#   docker build -f server/Dockerfile -t kds-server .
#   docker run -p 8790:8790 -e KDS_ALLOWED_ORIGINS=https://keisuke1113s.github.io kds-server
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.json vitest.config.ts ./
RUN npm ci --ignore-scripts

# エンジン（src/engine, src/data, src/ai）とサーバー本体だけをコピーする
COPY src ./src
COPY server ./server

ENV PORT=8790
EXPOSE 8790
CMD ["npx", "tsx", "server/src/main.ts"]
