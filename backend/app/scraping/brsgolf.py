"""Scrape tee times from BRS Golf (visitors.brsgolf.com) via internal JSON API."""
""" we firstly boot up a playwright context,take the cookies, then we make a request to the API to get the tee times."""
import json
from typing import Optional
from urllib.parse import urlparse

from playwright.async_api import APIRequestContext, async_playwright

from app.models.tee_time import TeeTime


class ScrapeError(Exception):
    pass


_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36"
)


def _validate_and_normalize_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ScrapeError("BRS Golf URL must be http(s)")
    if parsed.netloc != "visitors.brsgolf.com":
        raise ScrapeError("BRS Golf URL host must be visitors.brsgolf.com")
    slug = parsed.path.strip("/")
    if not slug or "/" in slug:
        raise ScrapeError("BRS Golf URL must be of form https://visitors.brsgolf.com/<club>")
    return f"{parsed.scheme}://{parsed.netloc}/{slug}"


async def _fetch_json(request: APIRequestContext, url: str, *, headers: dict[str, str]) -> dict:
    resp = await request.get(url, headers=headers, timeout=30000)
    status = resp.status
    text = await resp.text()
    if status != 200:
        raise ScrapeError(f"GET {url} returned {status}: {text[:200]}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ScrapeError(f"GET {url} returned non-JSON body") from exc
    if not isinstance(data, dict):
        raise ScrapeError("BRS Golf API returned unexpected shape (expected object)")
    return data


def _available_slots_count(slots: object) -> int:
    if not isinstance(slots, dict):
        return 0
    count = 0
    for n in ("1", "2", "3", "4"):
        s = slots.get(n)
        if isinstance(s, dict) and (s.get("status") == "Available"):
            count += 1
    return count


def _extract_price(tee: dict, players: int) -> Optional[str]:
    green_fees = tee.get("green_fees")
    if not isinstance(green_fees, list) or not green_fees:
        return None
    key = f"green_fee{players}_ball"
    for fee in green_fees:
        if not isinstance(fee, dict):
            continue
        val = fee.get(key)
        if val is None:
            continue
        s = str(val).strip()
        return s if s else None
    return None


async def scrape_tee_times(url: str, iso_date: str, players: int) -> list[TeeTime]:
    club_url = _validate_and_normalize_url(url)
    parsed = urlparse(club_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    # POC assumption: course_id is always 1.
    api_url = f"{origin}/api/casualBooking/teesheet?date={iso_date}&course_id=1"

    async with async_playwright() as p:
        request = await p.request.new_context(
            extra_http_headers={
                "User-Agent": _USER_AGENT,
            }
        )
        try:
            # Prime any required cookies (e.g. Cloudflare load balancer cookie).
            await request.get(club_url, timeout=30000)

            api_headers = {
                "Accept": "application/json, text/plain, */*",
                "Referer": club_url,
                "X-Requested-With": "XMLHttpRequest",
            }
            data = await _fetch_json(
                request,
                api_url,
                headers=api_headers,
            )
            tee_times_raw = (data.get("data") or {}).get("tee_times")
            if not isinstance(tee_times_raw, list) or not tee_times_raw:
                return []

            tee_times: list[TeeTime] = []
            for tee in tee_times_raw:
                if not isinstance(tee, dict):
                    continue
                time_text = tee.get("time")
                if not time_text:
                    continue

                slots_count = _available_slots_count(tee.get("slots"))
                if slots_count < players:
                    continue

                tee_times.append(
                    TeeTime(
                        time=str(time_text),
                        price=_extract_price(tee, players),
                        booking_url=None,
                    )
                )

            return tee_times
        finally:
            await request.dispose()

