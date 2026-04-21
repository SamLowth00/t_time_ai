from datetime import date
from typing import Optional

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
