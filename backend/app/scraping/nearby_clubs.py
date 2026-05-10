import os
import re

import httpx

from app.models.tee_time import GolfClub, LocationSuggestion

PLACES_BASE = "https://places.googleapis.com/v1"
TIMEOUT = 15.0

# Filter layers applied to searchText results — defence-in-depth on top of
# Google's editorial relevance ranking, which already demotes most duds.
PRIMARY_TYPE_BLOCKLIST = {
    "indoor_golf_course",
    "bar",
    "restaurant",
    "tourist_attraction",
    "amusement_center",
    "cafe",
}
NAME_BLOCKLIST_RE = re.compile(
    r"adventure golf|mini ?golf|crazy golf|foot ?golf|"
    r"pitch ?and ?putt|practice (putting|bunker|green)|driving range",
    re.IGNORECASE,
)
MIN_USER_RATINGS = 20


class ScrapeError(Exception):
    pass


def _api_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ScrapeError("GOOGLE_API_KEY not set")
    return key


def _is_real_golf_course(place: dict) -> bool:
    if place.get("primaryType") in PRIMARY_TYPE_BLOCKLIST:
        return False
    if (place.get("userRatingCount") or 0) < MIN_USER_RATINGS:
        return False
    name = (place.get("displayName") or {}).get("text", "")
    if NAME_BLOCKLIST_RE.search(name):
        return False
    return True


async def search_locations(query: str) -> list[LocationSuggestion]:
    if not query.strip():
        return []
    headers = {
        "X-Goog-Api-Key": _api_key(),
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{PLACES_BASE}/places:autocomplete",
            headers=headers,
            json={
                "input": query,
                "includedRegionCodes": ["GB"],
                "includedPrimaryTypes": ["geocode"],
            },
        )
    if resp.status_code != 200:
        raise ScrapeError(f"Autocomplete failed ({resp.status_code}): {resp.text}")

    out: list[LocationSuggestion] = []
    for s in resp.json().get("suggestions", []):
        pred = s.get("placePrediction") or {}
        place_id = pred.get("placeId")
        label = (pred.get("text") or {}).get("text")
        if place_id and label:
            out.append(LocationSuggestion(place_id=place_id, label=label))
    return out


async def find_nearby_golf_clubs(
    place_id: str, radius_km: float, max_results: int = 10
) -> list[GolfClub]:
    api_key = _api_key()
    radius_m = radius_km * 1000
    max_results = max(1, min(max_results, 20))

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        details = await client.get(
            f"{PLACES_BASE}/places/{place_id}",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "location",
            },
        )
        if details.status_code != 200:
            raise ScrapeError(f"Place details failed ({details.status_code}): {details.text}")
        loc = details.json().get("location") or {}
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        if lat is None or lng is None:
            raise ScrapeError(f"Place {place_id} has no location")

        # searchText uses Google's editorial taxonomy — catches UK private
        # clubs tagged as `sports_club` (Lees Hall, Hallamshire, …) that
        # the strict `includedTypes=[golf_course]` filter misses.
        # Note: DISTANCE rank requires `locationBias` (not `locationRestriction`).
        search = await client.post(
            f"{PLACES_BASE}/places:searchText",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.formattedAddress,"
                    "places.websiteUri,places.primaryType,places.userRatingCount"
                ),
                "Content-Type": "application/json",
            },
            json={
                "textQuery": "golf courses",
                "maxResultCount": max_results,
                "rankPreference": "DISTANCE",
                "locationBias": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius_m,
                    }
                },
            },
        )
    if search.status_code != 200:
        raise ScrapeError(f"Text search failed ({search.status_code}): {search.text}")

    clubs: list[GolfClub] = []
    for p in search.json().get("places", []):
        if not _is_real_golf_course(p):
            continue
        name = (p.get("displayName") or {}).get("text") or p.get("id", "")
        clubs.append(
            GolfClub(
                place_id=p.get("id", ""),
                name=name,
                address=p.get("formattedAddress"),
                website=p.get("websiteUri"),
            )
        )
    return clubs
