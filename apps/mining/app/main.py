"""GradeMap UB — Mining microservice entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import combinations, difficulty, risk, trajectory
from app.api import pipeline as pipeline_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    yield


app = FastAPI(
    title="GradeMap Mining Service",
    version="0.1.0",
    description="KDD pipeline and insight endpoints for GradeMap UB.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(difficulty.router)
app.include_router(risk.router)
app.include_router(combinations.router)
app.include_router(trajectory.router)
app.include_router(pipeline_router.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "grademap-mining"}
