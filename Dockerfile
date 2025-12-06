FROM node:18-bullseye-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV PORT=7000
EXPOSE 7000
CMD ["node", "index.js"]
