from fastapi import APIRouter, HTTPException

from app.models.tee_time import (
    LocationSearchResponse,
    NearbyClubsRequest,
    NearbyClubsResponse,
)
from app.scraping.nearby_clubs import (
    ScrapeError,
    find_nearby_golf_clubs,
    search_locations,
)

router = APIRouter()


@router.get("/nearby-clubs/locations", response_model=LocationSearchResponse)
async def get_locations(q: str = "") -> LocationSearchResponse:
    try:
        suggestions = await search_locations(q)
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return LocationSearchResponse(suggestions=suggestions)


@router.post("/nearby-clubs", response_model=NearbyClubsResponse)
async def post_nearby_clubs(payload: NearbyClubsRequest) -> NearbyClubsResponse:
    try:
        clubs = await find_nearby_golf_clubs(payload.place_id, payload.radius_km)
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return NearbyClubsResponse(clubs=clubs)
