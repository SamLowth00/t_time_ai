"""Uniform formatting for tee-time fields across vendors.

Each platform reports price/time in its own shape — `£45`, `45.00`, `45`,
`07:30`, `7:30 AM`, `07:30:00`. These helpers coerce them into one display
format so every vendor's results render identically: prices as `£45.00`, times
as 24-hour `HH:MM`.
"""
import re
from typing import Optional

# First money-looking number in the string. Tolerates thousands separators and
# an optional decimal part: "45", "45.50", "£1,250.00", "From 45".
_PRICE_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")

# HH:MM with optional seconds and optional am/pm suffix.
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?$", re.IGNORECASE)


def normalize_price(raw: Optional[str]) -> Optional[str]:
    """Return a price as `£X.XX`, or None when there's no price.

    A string with no numeric component (e.g. "POA", "Members only") is returned
    untouched — those carry meaning we'd lose by dropping them.
    """
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    match = _PRICE_NUM_RE.search(text)
    if not match:
        return text
    value = float(match.group(0).replace(",", ""))
    return f"£{value:.2f}"


def normalize_time(raw: Optional[str]) -> str:
    """Return a tee time as 24-hour `HH:MM`.

    Unparseable input is returned stripped-but-unchanged rather than dropped.
    """
    if raw is None:
        return ""
    text = raw.strip()
    match = _TIME_RE.match(text)
    if not match:
        return text
    hour = int(match.group(1))
    minute = int(match.group(2))
    meridiem = match.group(3)
    if meridiem:
        meridiem = meridiem.lower()
        if meridiem == "pm" and hour != 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
    if hour > 23 or minute > 59:
        return text
    return f"{hour:02d}:{minute:02d}"
