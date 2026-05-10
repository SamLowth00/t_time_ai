from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.api.discovery import router as discovery_router
from app.api.nearby_clubs import router as nearby_clubs_router

app = FastAPI(title="t-time-ai")

app.add_middleware(
    CORSMiddleware,
    # Dev: Vite can run on different ports / localhost vs 127.0.0.1.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\\.0\\.0\\.1):\\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nearby_clubs_router)
app.include_router(discovery_router)
