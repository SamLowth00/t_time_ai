"""Scrape tee times from IntelligentGolf-style /visitorbooking/ pages via AJAX JSON."""

from __future__ import annotations

import html
import json
import re
from datetime import date
from typing import Optional
from urllib.parse import urljoin, urlparse, urlunparse

from playwright.async_api import APIRequestContext, async_playwright

from app.models.tee_time import TeeTime


class ScrapeError(Exception):
    pass


_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36"
)


def _normalize_visitorbooking_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ScrapeError("URL must be http(s)")

    # Accept any host, but require the visitorbooking path.
    if "/visitorbooking" not in parsed.path.lower():
        raise ScrapeError("URL must contain /visitorbooking")

    # Strip query/fragment; normalize to .../visitorbooking/
    parts = parsed.path.split("/")
    try:
        idx = [p.lower() for p in parts].index("visitorbooking")
    except ValueError as exc:
        raise ScrapeError("URL path must include /visitorbooking") from exc

    normalized_path = "/" + "/".join([p for p in parts[: idx + 1] if p]) + "/"
    return urlunparse(parsed._replace(path=normalized_path, query="", fragment=""))


def _origin(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _iso_to_ddmmyyyy(iso_date: str) -> str:
    try:
        d = date.fromisoformat(iso_date)
    except ValueError as exc:
        raise ScrapeError(f"Invalid date (expected YYYY-MM-DD): {iso_date}") from exc
    return d.strftime("%d-%m-%Y")


_SLOT_START_RE = re.compile(r'<div class="teetimes-slot\b', re.IGNORECASE)
_BOOKABLE_RE = re.compile(r"bookable:(\d+)")
_HREF_RE = re.compile(r'<a[^>]+href="([^"]+)"', re.IGNORECASE)
_TIME_RE = re.compile(r"slot-time['\"]\s*>\s*([^<]+)\s*<", re.IGNORECASE)
_REMAINING_RE = re.compile(r"""<span class=['"]maxplayers['"]>\s*(\d+)x\s*</span>""")


def _extract_slots(teetimes_html: str, base_url: str, players: int) -> list[TeeTime]:
    if not teetimes_html:
        return []

    tee_times: list[TeeTime] = []

    starts = [m.start() for m in _SLOT_START_RE.finditer(teetimes_html)]
    if not starts:
        return []

    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(teetimes_html)
        chunk = teetimes_html[start:end]

        m_bookable = _BOOKABLE_RE.search(chunk)
        if not m_bookable:
            continue
        try:
            max_players = int(m_bookable.group(1))
        except ValueError:
            continue

        # Some slots show an "Nx" badge indicating remaining capacity (e.g. "1x"
        # means only 1 place left). When present, treat that as the effective
        # cap for this slot, not the theoretical max.
        remaining_players: Optional[int] = None
        m_remaining = _REMAINING_RE.search(chunk)
        if m_remaining:
            try:
                remaining_players = int(m_remaining.group(1))
            except ValueError:
                remaining_players = None

        effective_capacity = (
            min(max_players, remaining_players)
            if remaining_players is not None
            else max_players
        )

        if effective_capacity < players:
            continue

        m_href = _HREF_RE.search(chunk)
        if not m_href:
            continue
        href = html.unescape(m_href.group(1))
        booking_url = urljoin(base_url, href)

        m_time = _TIME_RE.search(chunk)
        if not m_time:
            continue
        time_text = html.unescape(m_time.group(1)).strip()
        if not time_text:
            continue

        price: Optional[str] = None
        # The hidden tipForm includes a line per party size with a span.price.
        # Pull the price for the requested `players` if present.
        price_re = re.compile(
            rf'name="numslots"\s+value="{players}"[^>]*>'
            r"[\s\S]*?"
            r'<span class="price">\s*([^<]+?)\s*</span>',
            re.IGNORECASE,
        )
        m_price = price_re.search(chunk)
        if m_price:
            p = html.unescape(m_price.group(1)).strip()
            price = p if p else None

        tee_times.append(TeeTime(time=time_text, price=price, booking_url=booking_url))

    return tee_times


async def _post_ajax(
    request: APIRequestContext, base_url: str, *, ddmmyyyy: str
) -> dict[str, object]:
    resp = await request.post(
        base_url,
        form={
            "date": ddmmyyyy,
            "course": "",
            "group": "1",
            "maxholes": "",
            "requestType": "ajax",
        },
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": _origin(base_url),
            "Referer": base_url,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=30000,
    )
    status = resp.status
    text = await resp.text()
    if status != 200:
        raise ScrapeError(f"AJAX POST returned {status}: {text[:200]}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ScrapeError("AJAX POST returned non-JSON body") from exc
    if not isinstance(data, dict):
        raise ScrapeError("AJAX POST returned unexpected shape (expected object)")
    return data


async def scrape_tee_times(url: str, iso_date: str, players: int) -> list[TeeTime]:
    if players < 1 or players > 4:
        raise ScrapeError("players must be between 1 and 4")

    base_url = _normalize_visitorbooking_url(url)
    ddmmyyyy = _iso_to_ddmmyyyy(iso_date)

    async with async_playwright() as p:
        request = await p.request.new_context(
            extra_http_headers={
                "User-Agent": _USER_AGENT,
            }
        )
        try:
            # Prime cookies (PHP session etc.)
            await request.get(base_url, timeout=30000)

            data = await _post_ajax(request, base_url, ddmmyyyy=ddmmyyyy)
            teetimes_html = data.get("teetimes")
            if not isinstance(teetimes_html, str):
                return []

            return _extract_slots(teetimes_html, base_url, players)
        finally:
            await request.dispose()

