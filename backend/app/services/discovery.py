import asyncio
import logging
import uuid
from typing import AsyncIterator, Optional

from pydantic import BaseModel

from app.models.tee_time import (
    ClubBookingFoundEvent,
    ClubStartedEvent,
    ClubSucceededEvent,
    ClubUnsuccessfulEvent,
    ClubsFoundEvent,
    GolfClub,
    JobDoneEvent,
    TeeTime,
)
from app.scraping import VENDOR_SCRAPERS
from app.scraping.nearby_clubs import find_nearby_golf_clubs
from app.scraping.normalize import normalize_price, normalize_time
from app.scraping.webcrawler import RobotsDisallowedError, discover_booking_url

logger = logging.getLogger(__name__)

#change to redis queue
JOBS: dict[str, asyncio.Queue] = {}

CONCURRENCY = 8
MAX_CANDIDATES = 20  # Google Places searchNearby cap
TARGET_SUCCESSES = 10
WEBCRAWLER_TIMEOUT_S = 35
SCRAPER_TIMEOUT_S = 60

# Server-wide cap on concurrent discovery jobs. Each job runs CONCURRENCY workers,
# each able to drive a Playwright context, so peak browser count is
# MAX_CONCURRENT_JOBS * CONCURRENCY (5 * 8 = 40). This is the backstop for when
# per-IP rate limits are bypassed by many distinct IPs. Job N+1 waits at the
# `async with` in _run_job until an in-flight job finishes.
MAX_CONCURRENT_JOBS = 5

# Built lazily, not at import time. On Python 3.9 an asyncio.Semaphore binds to the
# event loop that exists when it's constructed — at import time that is not uvicorn's
# serving loop, so a job that actually had to wait would raise "got Future attached
# to a different loop". Constructing it on first use (inside _run_job, on the serving
# loop) binds it correctly. The check-and-assign has no `await`, so concurrent
# callers cannot interleave and race it.
_discovery_semaphore: Optional[asyncio.Semaphore] = None


def _get_discovery_semaphore() -> asyncio.Semaphore:
    global _discovery_semaphore
    if _discovery_semaphore is None:
        _discovery_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
    return _discovery_semaphore


def _uniform_tee_times(
    tee_times: list[TeeTime], fallback_booking_url: str
) -> list[TeeTime]:
    """Coerce every vendor's tee times into one shape: `£X.XX` price, 24-hour
    `HH:MM` time, and a booking link on every row (falling back to the club's
    discovered booking URL when the scraper couldn't produce a per-slot link).
    """
    return [
        TeeTime(
            time=normalize_time(tt.time),
            price=normalize_price(tt.price),
            booking_url=tt.booking_url or fallback_booking_url,
        )
        for tt in tee_times
    ]


def start_job(
    radius_km: float,
    iso_date: str,
    players: int,
    *,
    place_id: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> str:
    job_id = uuid.uuid4().hex
    JOBS[job_id] = asyncio.Queue()
    asyncio.create_task(
        _run_job(job_id, radius_km, iso_date, players, place_id, lat, lng)
    )
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
    radius_km: float,
    iso_date: str,
    players: int,
    place_id: Optional[str],
    lat: Optional[float],
    lng: Optional[float],
) -> None:
    queue = JOBS[job_id]
    success_count = 0
    # Wait here for a concurrency slot. The POST already returned a job_id and the
    # client may already be subscribed; its SSE stream stays silent until we're in.
    async with _get_discovery_semaphore():
        try:
            clubs = await find_nearby_golf_clubs(
                radius_km,
                place_id=place_id,
                lat=lat,
                lng=lng,
                max_results=MAX_CANDIDATES,
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

            reason = (
                "target_reached"
                if success_count >= TARGET_SUCCESSES
                else "exhausted"
            )
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
    except RobotsDisallowedError:
        queue.put_nowait(
            ClubUnsuccessfulEvent(
                place_id=club.place_id, reason="robots_disallowed"
            )
        )
        return False
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
        if crawl.unsupported_booking_url:
            queue.put_nowait(
                ClubUnsuccessfulEvent(
                    place_id=club.place_id,
                    reason="unsupported_vendor",
                    detail=crawl.unsupported_booking_url,
                )
            )
        else:
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
            tee_times=_uniform_tee_times(tee_times, crawl.booking_url),
        )
    )
    return True
