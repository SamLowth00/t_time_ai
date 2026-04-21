"""Scrape tee times from Chronogolf. using JSON API."""
import json
import re
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from playwright.async_api import APIRequestContext, async_playwright

from app.models.tee_time import TeeTime


class ScrapeError(Exception):
    pass


_CLUB_PATH_RE = re.compile(r"/club/([^/]+)/(widget|teetimes)")

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def _parse_widget_url(url: str) -> tuple[str, str, dict[str, str]]:
    """Return (identifier, variant, params).

    `identifier` is either a numeric club id or a slug. `variant` is "widget" or
    "teetimes". Widget URLs carry params in the fragment (`#?key=val`); teetimes
    URLs carry them in the query string. For teetimes URLs we ignore the param
    hints — `coursesIds` uses UUIDs incompatible with the v1 API, so we fall
    back to auto-discovery regardless.
    """
    parsed = urlparse(url)
    m = _CLUB_PATH_RE.search(parsed.path)
    if not m:
        raise ScrapeError(
            "Could not parse club URL (expected /club/<id-or-slug>/widget or /teetimes)"
        )
    identifier, variant = m.group(1), m.group(2)
    if variant == "widget":
        fragment = parsed.fragment.lstrip("?")
        params = dict(parse_qsl(fragment, keep_blank_values=True))
    else:
        params = {}
    return identifier, variant, params


async def _fetch_json(request: APIRequestContext, url: str):
    resp = await request.get(url, timeout=15000)
    if resp.status != 200:
        raise ScrapeError(f"GET {url} returned {resp.status}")
    try:
        return json.loads(await resp.text())
    except json.JSONDecodeError as exc:
        raise ScrapeError(f"GET {url} returned non-JSON body") from exc


async def _lookup_courses(
    request: APIRequestContext, identifier: str
) -> tuple[str, str, str]:
    """Return (club_id, course_id, nb_holes). `identifier` can be numeric id or slug."""
    data = await _fetch_json(
        request, f"https://www.chronogolf.com/marketplace/clubs/{identifier}/courses"
    )
    if not isinstance(data, list) or not data:
        raise ScrapeError(f"No courses found for club {identifier}")
    bookable = [c for c in data if c.get("online_booking_enabled")]
    course = bookable[0] if bookable else data[0]
    club_id = course.get("club_id")
    if club_id is None:
        raise ScrapeError(f"Course response for {identifier} missing club_id")
    return str(club_id), str(course["id"]), str(course.get("holes") or 18)


async def _default_affiliation_id(request: APIRequestContext, club_id: str) -> str:
    data = await _fetch_json(
        request,
        f"https://www.chronogolf.com/marketplace/organizations/{club_id}/affiliation_types",
    )
    if not isinstance(data, list) or not data:
        raise ScrapeError(f"No affiliation types found for club {club_id}")

    def is_visitor(a: dict) -> bool:
        return (
            a.get("default_role") == "public"
            and a.get("bookable_on_marketplace")
            and a.get("publicly_visible")
            and not a.get("deleted")
        )

    visitors = [a for a in data if is_visitor(a)]
    if not visitors:
        raise ScrapeError(f"No public/bookable affiliation types for club {club_id}")

    # Prefer an "adult" visitor type over juniors/complimentary.
    adults = [a for a in visitors if "adult" in (a.get("name") or "").lower()]
    chosen = adults[0] if adults else visitors[0]
    return str(chosen["id"])


async def _resolve_params(
    request: APIRequestContext, identifier: str, params: dict[str, str]
) -> tuple[str, str, str, str]:
    """Return (club_id, course_id, nb_holes, affiliation_id).

    Always calls `/courses` so we can resolve slugs to numeric `club_id`.
    """
    club_id, default_course_id, default_holes = await _lookup_courses(request, identifier)
    course_id = params.get("course_id") or default_course_id
    nb_holes = params.get("nb_holes") or default_holes

    affiliation_raw = params.get("affiliation_type_ids", "")
    affiliation_ids = [p for p in affiliation_raw.split(",") if p]
    affiliation_id = affiliation_ids[0] if affiliation_ids else await _default_affiliation_id(
        request, club_id
    )
    return club_id, course_id, nb_holes, affiliation_id


def _build_api_url(
    club_id: str, course_id: str, nb_holes: str, affiliation_id: str, iso_date: str, players: int
) -> str:
    query_pairs: list[tuple[str, str]] = [
        ("date", iso_date),
        ("course_id", course_id),
    ]
    query_pairs.extend(("affiliation_type_ids[]", affiliation_id) for _ in range(players))
    query_pairs.append(("nb_holes", nb_holes))
    return (
        f"https://www.chronogolf.com/marketplace/clubs/{club_id}/teetimes?"
        + urlencode(query_pairs)
    )


def _booking_url(
    original_url: str,
    variant: str,
    course_id: str,
    nb_holes: str,
    affiliation_id: str,
    iso_date: str,
    players: int,
) -> str:
    parsed = urlparse(original_url)
    if variant == "widget":
        frag = {
            "course_id": course_id,
            "nb_holes": nb_holes,
            "date": iso_date,
            "affiliation_type_ids": ",".join([affiliation_id] * players),
        }
        return urlunparse(parsed._replace(fragment="?" + urlencode(frag)))
    # /teetimes uses native query params — date + groupSize drop the user on
    # the right page; the v2 UUID `coursesIds` we can't construct from v1 data.
    query = urlencode({"date": iso_date, "groupSize": str(players)})
    return urlunparse(parsed._replace(query=query, fragment=""))


def _format_price(green_fees: list[dict]) -> Optional[str]:
    if not green_fees:
        return None
    total = 0.0
    any_found = False
    for fee in green_fees:
        val = fee.get("green_fee")
        if val is None:
            val = fee.get("price")
        if val is None:
            continue
        try:
            total += float(val)
            any_found = True
        except (TypeError, ValueError):
            continue
    if not any_found:
        return None
    return f"{total:.2f}"


async def scrape_tee_times(url: str, iso_date: str, players: int) -> list[TeeTime]:
    identifier, variant, url_params = _parse_widget_url(url)

    async with async_playwright() as p:
        request = await p.request.new_context(
            extra_http_headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "Referer": f"https://www.chronogolf.com/club/{identifier}/{variant}",
            }
        )
        try:
            club_id, course_id, nb_holes, affiliation_id = await _resolve_params(
                request, identifier, url_params
            )
            api_url = _build_api_url(
                club_id, course_id, nb_holes, affiliation_id, iso_date, players
            )
            booking_link = _booking_url(
                url, variant, course_id, nb_holes, affiliation_id, iso_date, players
            )

            resp = await request.get(api_url, timeout=30000)
            status = resp.status
            body = await resp.text()

            if status == 422:
                return []
            if status != 200:
                raise ScrapeError(f"Chronogolf API returned {status}")

            try:
                data = json.loads(body)
            except json.JSONDecodeError as exc:
                raise ScrapeError("Chronogolf API returned non-JSON body") from exc

            if not isinstance(data, list):
                raise ScrapeError("Chronogolf API returned unexpected shape (expected list)")

            tee_times: list[TeeTime] = []
            for slot in data:
                if not isinstance(slot, dict):
                    continue
                if slot.get("out_of_capacity"):
                    continue
                if slot.get("frozen"):
                    continue
                start_time = slot.get("start_time")
                if not start_time:
                    continue
                price = _format_price(slot.get("green_fees") or [])
                tee_times.append(
                    TeeTime(time=str(start_time), price=price, booking_url=booking_link)
                )
            return tee_times
        finally:
            await request.dispose()
