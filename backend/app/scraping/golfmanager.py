"""Scrape tee times from Golfmanager, using its consumer JSON API.

Golfmanager booking widgets are SPAs hosted at
`https://{region}.golfmanager.com/{tenant}/consumer/book?area={area}&date=...`.
The widget hydrates from a public JSON endpoint that needs no auth/cookies — a
browser `User-Agent` header is enough — so we call it directly via Playwright's
`APIRequestContext` rather than rendering Chromium:

    GET {origin}/{tenant}/consumer/availability.json?date={YYYY-MM-DD}T00:00&area={area}
      -> {"area": N, "items": [ {start, price, slots, isExtra, ...}, ... ]}

`area` selects a tee sheet (e.g. "Markham 18 Holes"). When the discovered URL
omits it, the default area is resolved from `consumer/bookingInit.json`.
"""
import json
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from playwright.async_api import APIRequestContext, async_playwright

from app.models.tee_time import TeeTime


class ScrapeError(Exception):
    pass


_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def _parse_url(url: str) -> tuple[str, str, Optional[str]]:
    """Return (origin, tenant, area) from a Golfmanager booking URL.

    `origin` is scheme://host (the regional host varies, e.g. eu.golfmanager.com).
    `tenant` is the first path segment. `area` comes from the query string and may
    be None — callers then resolve the default area.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ScrapeError("Golfmanager URL must be an absolute http(s) URL")
    segments = [s for s in parsed.path.split("/") if s]
    if not segments:
        raise ScrapeError("Could not parse tenant from Golfmanager URL")
    tenant = segments[0]
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    area = query.get("area") or None
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin, tenant, area


async def _fetch_json(request: APIRequestContext, url: str):
    resp = await request.get(url, timeout=20000)
    if resp.status != 200:
        raise ScrapeError(f"GET {url} returned {resp.status}")
    try:
        return json.loads(await resp.text())
    except json.JSONDecodeError as exc:
        raise ScrapeError(f"GET {url} returned non-JSON body") from exc


async def _default_area(request: APIRequestContext, origin: str, tenant: str) -> str:
    data = await _fetch_json(request, f"{origin}/{tenant}/consumer/bookingInit.json")
    area = (data or {}).get("area") or {}
    area_id = area.get("id")
    if area_id is None:
        raise ScrapeError("Could not resolve default area for Golfmanager tenant")
    return str(area_id)


def _booking_url(origin: str, tenant: str, area: str, date_param: str) -> str:
    query = urlencode({"area": area, "date": date_param})
    return urlunparse(("https", urlparse(origin).netloc, f"/{tenant}/consumer/book", "", query, ""))


def _slot_time(start: str) -> str:
    """Extract a bare `HH:MM` from an ISO start like `2026-05-30T15:32:00+01:00`.

    The orchestrator's normalize_time only matches bare clock times, so we strip
    the date/offset here and keep the local wall-clock time the widget shows.
    """
    if "T" in start:
        clock = start.split("T", 1)[1]
        return clock[:5]
    return start


async def scrape_tee_times(url: str, iso_date: str, players: int) -> list[TeeTime]:
    origin, tenant, area = _parse_url(url)
    date_param = f"{iso_date}T00:00"

    async with async_playwright() as p:
        request = await p.request.new_context(
            extra_http_headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "Referer": f"{origin}/{tenant}/consumer/book",
            }
        )
        try:
            if area is None:
                area = await _default_area(request, origin, tenant)

            api_url = (
                f"{origin}/{tenant}/consumer/availability.json?"
                + urlencode({"date": date_param, "area": area})
            )
            resp = await request.get(api_url, timeout=30000)
            if resp.status != 200:
                raise ScrapeError(f"Golfmanager availability returned {resp.status}")
            try:
                data = json.loads(await resp.text())
            except json.JSONDecodeError as exc:
                raise ScrapeError("Golfmanager availability returned non-JSON body") from exc

            items = data.get("items") if isinstance(data, dict) else None
            if not isinstance(items, list):
                raise ScrapeError("Golfmanager availability returned unexpected shape")

            booking_link = _booking_url(origin, tenant, area, date_param)

            tee_times: list[TeeTime] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                # Extras (buggy/trolley add-ons) aren't tee times.
                if item.get("isExtra"):
                    continue
                # `slots` is the bookable capacity at that time — skip times that
                # can't seat the whole party.
                slots = item.get("slots")
                if isinstance(slots, int) and slots < players:
                    continue
                start = item.get("start")
                if not start:
                    continue

                # `price` is the per-person green fee; report the party total to
                # match the other vendors' merged-table convention.
                price: Optional[str] = None
                raw_price = item.get("price")
                if isinstance(raw_price, (int, float)):
                    price = f"{raw_price * players:.2f}"

                tee_times.append(
                    TeeTime(time=_slot_time(str(start)), price=price, booking_url=booking_link)
                )
            return tee_times
        finally:
            await request.dispose()
