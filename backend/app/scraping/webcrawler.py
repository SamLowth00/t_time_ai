"""Crawl a golf club's website looking for links to known booking vendors."""
import asyncio
import re
from collections import deque
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

from playwright.async_api import async_playwright


class ScrapeError(Exception):
    pass


class RobotsDisallowedError(Exception):
    """The crawl start URL is blocked by the site's robots.txt rules."""

    pass


_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36"
)

VENDOR_FRAGMENTS: list[tuple[str, str]] = [
    ("brsgolf", "brsgolf"),
    ("clubv1", "clubv1"),
    ("chronogolf", "chronogolf"),
    # IntelligentGolf hosts whole club sites under *.intelligentgolf.co.uk, so the
    # host isn't a reliable signal. The booking widget always lives at /visitorbooking.
    ("/visitorbooking", "intelligentgolf"),
]

MAX_PAGES = 10
MAX_DEPTH = 2
PER_REQUEST_TIMEOUT_MS = 10_000
TOTAL_TIMEOUT_S = 30

_URL_ATTR_RE = re.compile(
    r"""<(?:a|iframe|script)\b[^>]*?\s(?:href|src)\s*=\s*["']([^"']+)["']""",
    re.IGNORECASE | re.DOTALL,
)
_PRIORITY_PATH_RE = re.compile(
    r"/(visitors?|visitor-booking|book|booking|tee-?times?|green-?fees?|societies)(/|$)",
    re.IGNORECASE,
)
_SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "#")

# Parsed when robots.txt is missing or unreadable — explicit allow-all so a failed
# robots fetch does not block legitimate crawls (same behaviour as an empty file).
_PERMISSIVE_ROBOTS_LINES = ("User-agent: *", "Disallow:")


def _origin_from_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


async def _robots_parser_for_origin(
    request,
    origin: str,
    cache: dict[str, RobotFileParser],
) -> RobotFileParser:
    cached = cache.get(origin)
    if cached is not None:
        return cached
    robots_url = urljoin(origin + "/", "/robots.txt")
    rp = RobotFileParser()
    rp.set_url(robots_url)
    try:
        resp = await request.get(robots_url, timeout=PER_REQUEST_TIMEOUT_MS)
        if resp.status == 200:
            body = await resp.text()
            rp.parse(body.splitlines())
        else:
            rp.parse(list(_PERMISSIVE_ROBOTS_LINES))
    except Exception:
        rp.parse(list(_PERMISSIVE_ROBOTS_LINES))
    cache[origin] = rp
    return rp


async def _robots_allows_fetch(
    request,
    target_url: str,
    cache: dict[str, RobotFileParser],
) -> bool:
    origin = _origin_from_url(target_url)
    rp = await _robots_parser_for_origin(request, origin, cache)
    return rp.can_fetch(_USER_AGENT, target_url)


@dataclass
class CrawlResult:
    booking_url: Optional[str]
    vendor: Optional[str]
    pages_crawled: int
    unsupported_booking_url: Optional[str] = None


def _strip_www(host: str) -> str:
    host = host.lower()
    return host[4:] if host.startswith("www.") else host


def _toggle_www(netloc: str) -> str:
    """
    Swap between `www.example.com` and `example.com` (preserving port if present).
    """
    if not netloc:
        return netloc
    if "@" in netloc:
        # Very uncommon for our use, but keep it safe.
        auth, hostport = netloc.rsplit("@", 1)
    else:
        auth, hostport = "", netloc

    if ":" in hostport:
        host, port = hostport.split(":", 1)
        port_part = f":{port}"
    else:
        host, port_part = hostport, ""

    host_l = host.lower()
    swapped = host_l[4:] if host_l.startswith("www.") else f"www.{host_l}"
    rebuilt = f"{swapped}{port_part}"
    return f"{auth}@{rebuilt}" if auth else rebuilt


def _with_toggled_www(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse(
        (
            parsed.scheme,
            _toggle_www(parsed.netloc),
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )


def _is_cert_altname_mismatch_error(exc: Exception) -> bool:
    msg = str(exc)
    return "does not match certificate's altnames" in msg


def _is_dns_error(exc: Exception) -> bool:
    msg = str(exc)
    return "ENOTFOUND" in msg or "getaddrinfo" in msg


def _same_origin(candidate: str, start_host: str) -> bool:
    try:
        return _strip_www(urlparse(candidate).netloc) == start_host
    except ValueError:
        return False


def _normalize_for_dedup(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", "", ""))


def _match_vendor(url: str) -> Optional[str]:
    lowered = url.lower()
    for fragment, label in VENDOR_FRAGMENTS:
        if fragment in lowered:
            return label
    return None


def _is_booking_path(url: str) -> bool:
    try:
        path = urlparse(url).path or "/"
    except ValueError:
        return False
    return bool(_PRIORITY_PATH_RE.search(path))


def _validate_start_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ScrapeError("URL must be http(s)")
    if not parsed.netloc:
        raise ScrapeError("URL must include a host")
    return url


async def _crawl(start_url: str) -> CrawlResult:
    start_host = _strip_www(urlparse(start_url).netloc)
    robots_by_origin: dict[str, RobotFileParser] = {}

    priority_q: deque[tuple[str, int]] = deque()
    normal_q: deque[tuple[str, int]] = deque()
    visited: set[str] = set()
    # First cross-origin booking-looking URL we see — surfaced as a fallback so
    # callers can distinguish "site uses a vendor we don't support" from "site
    # has no booking link at all".
    unsupported_booking_url: Optional[str] = None

    priority_q.append((start_url, 0))

    async with async_playwright() as p:
        request = await p.request.new_context(
            extra_http_headers={"User-Agent": _USER_AGENT}
        )
        try:
            is_start = True
            while (priority_q or normal_q) and len(visited) < MAX_PAGES:
                url, depth = priority_q.popleft() if priority_q else normal_q.popleft()
                key = _normalize_for_dedup(url)
                if key in visited:
                    continue
                visited.add(key)

                if not await _robots_allows_fetch(request, url, robots_by_origin):
                    if url == start_url:
                        raise RobotsDisallowedError(start_url)
                    continue

                try:
                    resp = await request.get(url, timeout=PER_REQUEST_TIMEOUT_MS)
                except Exception as exc:
                    # One retry on transient DNS failures for the start URL —
                    # Playwright's Node resolver occasionally gets ENOTFOUND
                    # even when the domain resolves fine.
                    if is_start and _is_dns_error(exc):
                        await asyncio.sleep(0.5)
                        try:
                            resp = await request.get(url, timeout=PER_REQUEST_TIMEOUT_MS)
                        except Exception as retry_exc:
                            raise ScrapeError(
                                f"Failed to fetch {url}: {retry_exc}"
                            ) from retry_exc
                    elif is_start:
                        raise ScrapeError(f"Failed to fetch {url}: {exc}") from exc
                    else:
                        continue
                finally:
                    is_start = False

                final_url = resp.url
                vendor = _match_vendor(final_url)
                if vendor:
                    return CrawlResult(final_url, vendor, len(visited))

                if resp.status != 200:
                    continue
                content_type = (resp.headers.get("content-type") or "").lower()
                if "html" not in content_type:
                    continue

                body = await resp.text()
                extracted: list[str] = []
                for raw in _URL_ATTR_RE.findall(body):
                    raw_stripped = raw.strip()
                    if not raw_stripped:
                        continue
                    lowered = raw_stripped.lower()
                    if any(lowered.startswith(p) for p in _SKIP_SCHEMES):
                        continue
                    absolute = urljoin(final_url, raw_stripped)
                    parsed = urlparse(absolute)
                    if parsed.scheme not in ("http", "https"):
                        continue

                    vendor = _match_vendor(absolute)
                    if vendor:
                        return CrawlResult(absolute, vendor, len(visited))

                    if (
                        unsupported_booking_url is None
                        and not _same_origin(absolute, start_host)
                        and _is_booking_path(absolute)
                    ):
                        unsupported_booking_url = absolute

                    extracted.append(absolute)

                if depth >= MAX_DEPTH:
                    continue

                for absolute in extracted:
                    if not _same_origin(absolute, start_host):
                        continue
                    if _normalize_for_dedup(absolute) in visited:
                        continue
                    entry = (absolute, depth + 1)
                    if _is_booking_path(absolute):
                        priority_q.append(entry)
                    else:
                        normal_q.append(entry)

            return CrawlResult(None, None, len(visited), unsupported_booking_url)
        finally:
            await request.dispose()


async def discover_booking_url(start_url: str) -> CrawlResult:
    validated = _validate_start_url(start_url)
    try:
        return await asyncio.wait_for(_crawl(validated), timeout=TOTAL_TIMEOUT_S)
    except ScrapeError as exc:
        # Some club sites are configured with a cert that only covers the apex domain
        # (e.g. `thebunka.co.uk`) but not `www.thebunka.co.uk` (or vice versa).
        # We keep TLS verification on, and do a single targeted retry with the
        # alternate hostname when we see the specific mismatch error.
        if _is_cert_altname_mismatch_error(exc):
            retry_url = _with_toggled_www(validated)
            if retry_url != validated:
                try:
                    return await asyncio.wait_for(_crawl(retry_url), timeout=TOTAL_TIMEOUT_S)
                except Exception:
                    # Preserve the original, more actionable error message.
                    raise exc
        raise
    except asyncio.TimeoutError:
        return CrawlResult(None, None, MAX_PAGES, None)
