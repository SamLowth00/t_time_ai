"""Scrape tee times from ClubV1. using Playwright"""
from typing import Optional
from urllib.parse import urlencode, urljoin, urlparse, urlunparse, parse_qsl

from playwright.async_api import TimeoutError as PlaywrightTimeoutError, async_playwright

from app.models.tee_time import TeeTime


class ScrapeError(Exception):
    pass


def _with_date(url: str, iso_date: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["date"] = iso_date
    return urlunparse(parsed._replace(query=urlencode(query)))


async def scrape_tee_times(url: str, iso_date: str, players: int) -> list[TeeTime]:
    target_url = _with_date(url, iso_date)
    parsed = urlparse(target_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        try:
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            except PlaywrightTimeoutError as exc:
                raise ScrapeError(f"Timed out loading {target_url}") from exc

            # ClubV1 hydrates the tee sheet via SignalR after initial load. Wait
            # until either tee slots render OR an explicit unavailability/empty
            # message appears inside the container.
            try:
                # wait for #booking-teesheet-container to be present
                await page.wait_for_function(
                    """() => {
                        const c = document.querySelector('#booking-teesheet-container');
                        if (!c) return false;
                        if (c.querySelector('.tee')) return true;
                        if (c.querySelector('.tees .message')) return true;
                        return false;
                    }""",
                    timeout=20000,
                )
            except PlaywrightTimeoutError:
                return []

            tees = page.locator("#booking-teesheet-container .tee")
            count = await tees.count()
            if count == 0:
                return []

            tee_times: list[TeeTime] = []
            for i in range(count):
                tee = tees.nth(i)

                time_attr = await tee.get_attribute("data-teetime")
                if time_attr and " " in time_attr:
                    time_text = time_attr.split(" ", 1)[1]
                else:
                    time_el = tee.locator(".time")
                    time_text = (
                        (await time_el.first.inner_text()).strip()
                        if await time_el.count()
                        else ""
                    )

                price: Optional[str] = None
                value_loc = tee.locator(f".price.ball-{players} .value")
                if await value_loc.count() > 0:
                    value = (await value_loc.first.inner_text()).strip()
                    if value:
                        price = value

                booking_href: Optional[str] = None
                link = tee.locator("a[href*='/Visitors/BookingAdd']")
                if await link.count() > 0:
                    href = await link.first.get_attribute("href")
                    if href:
                        booking_href = urljoin(origin, href)

                tee_times.append(
                    TeeTime(time=time_text, price=price, booking_url=booking_href)
                )

            return tee_times
        finally:
            await context.close()
            await browser.close()
