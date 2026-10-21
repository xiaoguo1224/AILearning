FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
WORKDIR /workspace/frontend
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --fetch-retries=4 --fetch-timeout=180000
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm exec tsc -- --noEmit
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
