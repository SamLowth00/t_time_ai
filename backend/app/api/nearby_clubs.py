from fastapi import APIRouter, HTTPException, Request, Response

from app.models.tee_time import LocationSearchResponse
from app.rate_limit import limiter
from app.scraping.nearby_clubs import ScrapeError, search_locations

router = APIRouter()


@router.get("/nearby-clubs/locations", response_model=LocationSearchResponse)
@limiter.limit("30/minute")
async def get_locations(
    request: Request, response: Response, q: str = ""
) -> LocationSearchResponse:
    try:
        suggestions = await search_locations(q)
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return LocationSearchResponse(suggestions=suggestions)
