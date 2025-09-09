from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .routers import importer, courses, metrics, admin

app = FastAPI(title="Malla Curricular API", version="0.1.0")

# CORS (adjust origins as needed, allow frontend dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in (settings.FRONTEND_ORIGINS or "").split(",") if o.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(importer.router, prefix="/import", tags=["import"])
app.include_router(courses.router, prefix="/students", tags=["courses"])
app.include_router(metrics.router, prefix="/metrics", tags=["metrics"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
def health():
    return {"status": "ok", "env": settings.APP_ENV}
