import scrapy


class ProgramItem(scrapy.Item):
    program = scrapy.Field()
    courses = scrapy.Field()
    source_url = scrapy.Field()
    _source = scrapy.Field()
