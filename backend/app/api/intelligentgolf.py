from fastapi import APIRouter, HTTPException

from app.models.tee_time import IntelligentgolfRequest, IntelligentgolfResponse
from app.scraping.intelligentgolf import ScrapeError, scrape_tee_times

router = APIRouter()


@router.post("/intelligentgolf", response_model=IntelligentgolfResponse)
async def scrape_intelligentgolf(
    payload: IntelligentgolfRequest,
) -> IntelligentgolfResponse:
    try:
        tee_times = await scrape_tee_times(
            str(payload.url), payload.date.isoformat(), payload.players
        )
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return IntelligentgolfResponse(tee_times=tee_times)

