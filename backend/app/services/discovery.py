import asyncio
import logging
import uuid
from typing import AsyncIterator

from pydantic import BaseModel

from app.models.tee_time import (
    ClubBookingFoundEvent,
    ClubStartedEvent,
    ClubSucceededEvent,
    ClubUnsuccessfulEvent,
    ClubsFoundEvent,
    GolfClub,
    JobDoneEvent,
)
from app.scraping import VENDOR_SCRAPERS
from app.scraping.nearby_clubs import find_nearby_golf_clubs
from app.scraping.webcrawler import discover_booking_url

logger = logging.getLogger(__name__)

#change to redis queue
JOBS: dict[str, asyncio.Queue] = {}

CONCURRENCY = 8
MAX_CANDIDATES = 20  # Google Places searchNearby cap
TARGET_SUCCESSES = 10
WEBCRAWLER_TIMEOUT_S = 35
SCRAPER_TIMEOUT_S = 60


def start_job(place_id: str, radius_km: float, iso_date: str, players: int) -> str:
    job_id = uuid.uuid4().hex
    JOBS[job_id] = asyncio.Queue()
    asyncio.create_task(_run_job(job_id, place_id, radius_km, iso_date, players))
    return job_id


async def subscribe(job_id: str) -> AsyncIterator[BaseModel]:
    queue = JOBS.get(job_id)
    if queue is None:
        return
    try:
        while True:
            event = await queue.get()
            yield event
            if isinstance(event, JobDoneEvent):
                break
    finally:
        JOBS.pop(job_id, None)


async def _run_job(
    job_id: str,
    place_id: str,
    radius_km: float,
    iso_date: str,
    players: int,
) -> None:
    queue = JOBS[job_id]
    success_count = 0
    try:
        clubs = await find_nearby_golf_clubs(
            place_id, radius_km, max_results=MAX_CANDIDATES
        )
        queue.put_nowait(ClubsFoundEvent(clubs=clubs))

        # Workers pull from this in distance order; earliest = nearest.
        club_queue: asyncio.Queue = asyncio.Queue()
        for c in clubs:
            club_queue.put_nowait(c)

        stop_event = asyncio.Event()

        async def worker() -> None:
            nonlocal success_count
            while not stop_event.is_set():
                try:
                    club = club_queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                succeeded = await _process_club(club, iso_date, players, queue)
                if succeeded:
                    success_count += 1
                    if success_count >= TARGET_SUCCESSES:
                        stop_event.set()

        await asyncio.gather(*[worker() for _ in range(CONCURRENCY)])

        reason = "target_reached" if success_count >= TARGET_SUCCESSES else "exhausted"
    except Exception:
        logger.exception("discovery job %s failed", job_id)
        reason = "exhausted"
    finally:
        queue.put_nowait(JobDoneEvent(reason=reason, successful=success_count))


async def _process_club(
    club: GolfClub,
    iso_date: str,
    players: int,
    queue: asyncio.Queue,
) -> bool:
    if not club.website:
        queue.put_nowait(
            ClubUnsuccessfulEvent(place_id=club.place_id, reason="no_website")
        )
        return False

    queue.put_nowait(ClubStartedEvent(place_id=club.place_id))

    try:
        crawl = await asyncio.wait_for(
            discover_booking_url(club.website), timeout=WEBCRAWLER_TIMEOUT_S
        )
    except Exception as exc:
        queue.put_nowait(
            ClubUnsuccessfulEvent(
                place_id=club.place_id,
                reason="no_booking_url",
                detail=f"crawler error: {exc}",
            )
        )
        return False

    if not crawl.booking_url or not crawl.vendor:
        queue.put_nowait(
            ClubUnsuccessfulEvent(place_id=club.place_id, reason="no_booking_url")
        )
        return False

    queue.put_nowait(
        ClubBookingFoundEvent(
            place_id=club.place_id,
            booking_url=crawl.booking_url,
            vendor=crawl.vendor,
        )
    )

    scraper = VENDOR_SCRAPERS[crawl.vendor]
    try:
        tee_times = await asyncio.wait_for(
            scraper(crawl.booking_url, iso_date, players),
            timeout=SCRAPER_TIMEOUT_S,
        )
    except Exception as exc:
        queue.put_nowait(
            ClubUnsuccessfulEvent(
                place_id=club.place_id,
                reason="scrape_failed",
                detail=str(exc),
            )
        )
        return False

    queue.put_nowait(
        ClubSucceededEvent(
            place_id=club.place_id,
            booking_url=crawl.booking_url,
            vendor=crawl.vendor,
            tee_times=tee_times,
        )
    )
    return True
