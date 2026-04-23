from fastapi import APIRouter, HTTPException

from app.models.tee_time import WebcrawlerRequest, WebcrawlerResponse
from app.scraping.webcrawler import ScrapeError, discover_booking_url

router = APIRouter()


@router.post("/webcrawler", response_model=WebcrawlerResponse)
async def scrape_webcrawler(payload: WebcrawlerRequest) -> WebcrawlerResponse:
    try:
        result = await discover_booking_url(str(payload.url))
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return WebcrawlerResponse(
        booking_url=result.booking_url,
        vendor=result.vendor,
        pages_crawled=result.pages_crawled,
    )
