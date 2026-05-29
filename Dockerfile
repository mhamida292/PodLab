# PodLab — zero-dependency Node server, so the image stays tiny.
FROM node:22-alpine

# Built-in healthcheck hits the API so the orchestrator knows the feed loads.
WORKDIR /app

# Copy manifest first for layer caching (no deps to install, but keeps it clean).
COPY package.json ./
COPY server.js feed.js categorize.js config.js generate-icons.js ./
COPY public ./public

ENV PORT=9090
EXPOSE 9090

# Run as the built-in non-root user.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9090)+'/api/episodes').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
