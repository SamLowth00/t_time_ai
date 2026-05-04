import os

import httpx

from app.models.tee_time import GolfClub, LocationSuggestion

PLACES_BASE = "https://places.googleapis.com/v1"
TIMEOUT = 15.0


class ScrapeError(Exception):
    pass


def _api_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ScrapeError("GOOGLE_API_KEY not set")
    return key


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
            json={"input": query},
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


async def find_nearby_golf_clubs(place_id: str, radius_km: float) -> list[GolfClub]:
    api_key = _api_key()
    radius_m = radius_km * 1000

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

        nearby = await client.post(
            f"{PLACES_BASE}/places:searchNearby",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri",
                "Content-Type": "application/json",
            },
            json={
                "includedTypes": ["golf_course"],
                "maxResultCount": 10,
                "rankPreference": "DISTANCE",
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius_m,
                    }
                },
            },
        )
    if nearby.status_code != 200:
        raise ScrapeError(f"Nearby search failed ({nearby.status_code}): {nearby.text}")

    clubs: list[GolfClub] = []
    for p in nearby.json().get("places", []):
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
