# --- build the frontend ---
FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- python app serving API + PDFs + frontend ---
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY eval/ eval/
COPY --from=web /web/dist frontend/dist
ENV VAR_DIR=/app/var PYTHONUNBUFFERED=1
EXPOSE 8000
WORKDIR /app/backend
# Hosts like Render/Railway/Fly set $PORT; default 8000 locally
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
