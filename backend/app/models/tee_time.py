from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


class TeeTime(BaseModel):
    time: str
    price: Optional[str] = None
    booking_url: Optional[str] = None


class Clubv1Request(BaseModel):
    url: HttpUrl
    date: date
    players: int = Field(ge=1, le=4)


class Clubv1Response(BaseModel):
    tee_times: list[TeeTime]


class ChronogolfRequest(BaseModel):
    url: HttpUrl
    date: date
    players: int = Field(ge=1, le=4)


class ChronogolfResponse(BaseModel):
    tee_times: list[TeeTime]


class BrsgolfRequest(BaseModel):
    url: HttpUrl
    date: date
    players: int = Field(ge=1, le=4)


class BrsgolfResponse(BaseModel):
    tee_times: list[TeeTime]


class IntelligentgolfRequest(BaseModel):
    url: HttpUrl
    date: date
    players: int = Field(ge=1, le=4)


class IntelligentgolfResponse(BaseModel):
    tee_times: list[TeeTime]


class WebcrawlerRequest(BaseModel):
    url: HttpUrl


class WebcrawlerResponse(BaseModel):
    booking_url: Optional[str] = None
    vendor: Optional[Literal["clubv1", "chronogolf", "brsgolf", "intelligentgolf"]] = None
    pages_crawled: int
