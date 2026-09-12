FROM node:22-slim

WORKDIR /app

# 의존성 설치 (빌드에 devDeps 필요)
COPY package.json package-lock.json* ./
RUN npm install

# 소스 복사 + 빌드
COPY . .
RUN npm run build

# non-root 실행 (node 이미지 기본 제공 uid 1000)
RUN chown -R node:node /app
USER node

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
