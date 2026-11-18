# Card test image: Node, plus bash and git for tests/js/deploy.test.mjs, which runs
# scripts/deploy.sh. Built by scripts/test.sh; the repository is mounted on /app at run time.
FROM node:22-alpine
RUN apk add --no-cache bash git
WORKDIR /app
