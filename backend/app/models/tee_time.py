from datetime import date
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


class TeeTime(BaseModel):
    time: str
    price: Optional[str] = None
    booking_url: Optional[str] = None


class LocationSuggestion(BaseModel):
    place_id: str
    label: str


class GolfClub(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    website: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class LocationSearchResponse(BaseModel):
    suggestions: list[LocationSuggestion]


Vendor = Literal["clubv1", "chronogolf", "brsgolf", "intelligentgolf"]
UnsuccessfulReason = Literal[
    "no_website",
    "no_booking_url",
    "unsupported_vendor",
    "scrape_failed",
    "robots_disallowed",
]


class DiscoverRequest(BaseModel):
    # Either pick a place from autocomplete (place_id) or use the browser's
    # current location (lat/lng). Coords skip the Place Details lookup since
    # find_nearby_golf_clubs only needs a centre point.
    place_id: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    radius_km: float = Field(gt=0, le=50)
    date: date
    players: int = Field(ge=1, le=4)

    @model_validator(mode="after")
    def _require_location(self) -> "DiscoverRequest":
        has_coords = self.lat is not None and self.lng is not None
        if not self.place_id and not has_coords:
            raise ValueError("Provide either place_id or both lat and lng")
        return self


class JobStartResponse(BaseModel):
    job_id: str


class ClubsFoundEvent(BaseModel):
    type: Literal["clubs_found"] = "clubs_found"
    clubs: list[GolfClub]
    # Resolved search centre (the area/coords the user searched from), so the
    # frontend can pin it on the map.
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None


class ClubStartedEvent(BaseModel):
    type: Literal["club_started"] = "club_started"
    place_id: str


class ClubBookingFoundEvent(BaseModel):
    type: Literal["club_booking_found"] = "club_booking_found"
    place_id: str
    booking_url: str
    vendor: Vendor


class ClubSucceededEvent(BaseModel):
    type: Literal["club_succeeded"] = "club_succeeded"
    place_id: str
    booking_url: str
    vendor: Vendor
    tee_times: list[TeeTime]


class ClubUnsuccessfulEvent(BaseModel):
    type: Literal["club_unsuccessful"] = "club_unsuccessful"
    place_id: str
    reason: UnsuccessfulReason
    detail: Optional[str] = None


JobDoneReason = Literal["target_reached", "exhausted"]


class JobDoneEvent(BaseModel):
    type: Literal["done"] = "done"
    reason: JobDoneReason
    successful: int


DiscoveryEvent = Annotated[
    Union[
        ClubsFoundEvent,
        ClubStartedEvent,
        ClubBookingFoundEvent,
        ClubSucceededEvent,
        ClubUnsuccessfulEvent,
        JobDoneEvent,
    ],
    Field(discriminator="type"),
]
