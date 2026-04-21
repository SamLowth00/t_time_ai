from fastapi import APIRouter, HTTPException

from app.models.tee_time import Clubv1Request, Clubv1Response
from app.scraping.clubv1 import ScrapeError, scrape_tee_times

router = APIRouter()


@router.post("/clubv1", response_model=Clubv1Response)
async def scrape_clubv1(payload: Clubv1Request) -> Clubv1Response:
    try:
        tee_times = await scrape_tee_times(
            str(payload.url), payload.date.isoformat(), payload.players
        )
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return Clubv1Response(tee_times=tee_times)
