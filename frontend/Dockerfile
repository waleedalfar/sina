FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The node image already ships an unprivileged `node` user; nothing in the
# dev server needs root. `.next` and `node_modules` are created here so that
# when Docker initialises the named volumes mounted over them it copies this
# ownership through — otherwise they appear as root-owned and Turbopack
# fails to take its lockfile.
RUN mkdir -p /app/.next /app/node_modules && chown -R node:node /app
USER node

CMD ["npm", "run", "dev"]
