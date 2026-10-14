FROM node:24-bookworm-slim

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=10000 \
	GAME_DATABASE=/var/data/chaal.sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 10000
CMD ["npm", "run", "server"]
