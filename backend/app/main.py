from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.brsgolf import router as brsgolf_router
from app.api.chronogolf import router as chronogolf_router
from app.api.clubv1 import router as clubv1_router
from app.api.intelligentgolf import router as intelligentgolf_router

app = FastAPI(title="t-time-ai")

app.add_middleware(
    CORSMiddleware,
    # Dev: Vite can run on different ports / localhost vs 127.0.0.1.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\\.0\\.0\\.1):\\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clubv1_router)
app.include_router(chronogolf_router)
app.include_router(brsgolf_router)
app.include_router(intelligentgolf_router)
