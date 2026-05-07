from app.scraping import brsgolf, chronogolf, clubv1, intelligentgolf

VENDOR_SCRAPERS = {
    "clubv1": clubv1.scrape_tee_times,
    "chronogolf": chronogolf.scrape_tee_times,
    "brsgolf": brsgolf.scrape_tee_times,
    "intelligentgolf": intelligentgolf.scrape_tee_times,
}
