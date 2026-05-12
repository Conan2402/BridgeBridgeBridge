# define base image
FROM node:22-bookworm-slim

# install runtime tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        dumb-init \
        git \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

# define environment
ENV NODE_ENV=production

# set work directory
WORKDIR /usr/src/app

# copy package files first for better docker caching
COPY --chown=node:node package*.json ./

# install production dependencies
RUN npm ci --omit=dev

# copy all sources to container
COPY --chown=node:node . .

# make sure the node user can write where dependencies may cache files
RUN chown -R node:node /usr/src/app

# run your app
USER node
CMD ["dumb-init", "node", "index.js"]