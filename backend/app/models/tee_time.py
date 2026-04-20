from datetime import date
from typing import Optional

from pydantic import BaseModel, HttpUrl


class TeeTime(BaseModel):
    time: str
    prices: dict[str, str]
    booking_url: Optional[str] = None


class Clubv1Request(BaseModel):
    url: HttpUrl
    date: date


class Clubv1Response(BaseModel):
    tee_times: list[TeeTime]
