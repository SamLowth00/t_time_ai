import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

load_dotenv()

from app.api.discovery import router as discovery_router
from app.api.nearby_clubs import router as nearby_clubs_router
from app.rate_limit import limiter, rate_limit_handler

app = FastAPI(title="t-time-ai")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
ALLOW_ORIGINS = sorted({FRONTEND_ORIGIN, *DEV_ORIGINS})

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nearby_clubs_router)
app.include_router(discovery_router)
