from fastapi import APIRouter, HTTPException

from app.models.tee_time import ChronogolfRequest, ChronogolfResponse
from app.scraping.chronogolf import ScrapeError, scrape_tee_times

router = APIRouter()


@router.post("/chronogolf", response_model=ChronogolfResponse)
async def scrape_chronogolf(payload: ChronogolfRequest) -> ChronogolfResponse:
    try:
        tee_times = await scrape_tee_times(
            str(payload.url), payload.date.isoformat(), payload.players
        )
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return ChronogolfResponse(tee_times=tee_times)
