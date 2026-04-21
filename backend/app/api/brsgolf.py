from fastapi import APIRouter, HTTPException

from app.models.tee_time import BrsgolfRequest, BrsgolfResponse
from app.scraping.brsgolf import ScrapeError, scrape_tee_times

router = APIRouter()


@router.post("/brsgolf", response_model=BrsgolfResponse)
async def scrape_brsgolf(payload: BrsgolfRequest) -> BrsgolfResponse:
    try:
        tee_times = await scrape_tee_times(
            str(payload.url), payload.date.isoformat(), payload.players
        )
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return BrsgolfResponse(tee_times=tee_times)

