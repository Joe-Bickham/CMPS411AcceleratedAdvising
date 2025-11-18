BOT_NAME = "scrapy_catalog"

SPIDER_MODULES = ["scrapy_catalog.spiders"]
NEWSPIDER_MODULE = "scrapy_catalog.spiders"

ROBOTSTXT_OBEY = False
CONCURRENT_REQUESTS = 4
DOWNLOAD_DELAY = 0.7

DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "AcceleratedAdvisingScraper/1.0 (+https://southeastern.edu)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

ITEM_PIPELINES = {
    "scrapy_catalog.pipelines.ScrapyCatalogPipeline": 300,
}
