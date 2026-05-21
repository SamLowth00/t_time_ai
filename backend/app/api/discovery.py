from fastapi import APIRouter, HTTPException, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.models.tee_time import DiscoverRequest, JobStartResponse
from app.rate_limit import limiter
from app.services.discovery import JOBS, start_job, subscribe

router = APIRouter()


@router.post("/discover-tee-times", response_model=JobStartResponse)
@limiter.limit("5/hour;20/day")
async def post_discover(
    request: Request, response: Response, payload: DiscoverRequest
) -> JobStartResponse:
    job_id = start_job(
        radius_km=payload.radius_km,
        iso_date=payload.date.isoformat(),
        players=payload.players,
        place_id=payload.place_id,
        lat=payload.lat,
        lng=payload.lng,
    )
    return JobStartResponse(job_id=job_id)


@router.get("/discover-tee-times/{job_id}/events")
async def get_events(job_id: str) -> EventSourceResponse:
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    async def event_stream():
        async for event in subscribe(job_id):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_stream())
