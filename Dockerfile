FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
