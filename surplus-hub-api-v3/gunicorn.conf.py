import os

# Bind — Railway (and most PaaS) inject PORT; default to 8000 for local/docker.
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# Workers — fixed via env instead of cpu_count(): PaaS containers report the
# host's cores, which would massively over-provision workers per instance.
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
worker_class = "uvicorn.workers.UvicornWorker"

# Timeout
timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Process naming
proc_name = "surplus-hub-api"

# Preload app for faster worker startup
preload_app = True

# Recycle workers periodically to bound memory growth (e.g. ML/embedding leaks)
max_requests = 1000
max_requests_jitter = 100

# Graceful shutdown: allow in-flight requests to drain on SIGTERM
graceful_timeout = 30


def post_fork(server, worker):
    # With preload_app=True the SQLAlchemy engine is created in the master
    # process before forking, so all workers would otherwise share (and
    # corrupt) the parent's connection pool. Dispose it here so each worker
    # opens its own fresh connections.
    from app.db.session import engine

    engine.dispose()
