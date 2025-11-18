import re
import html
from urllib.parse import urljoin

import scrapy

CATALOG_HOST = "https://catalog.southeastern.edu"
PROGRAM_RE = re.compile(r"(programs?\s+of\s+study|\(a-z\)|programs)", re.I)
YEAR_RE = re.compile(r"\b(20\d{2})\s?[-–]{1,2}\s?(20\d{2})\b")
COURSE_RE = re.compile(r"\b([A-Z]{3,5})\s?-?\s?(\d{3,4}[A-Z]?)\b")
PREREQ_RE = re.compile(r"Prereq(?:uisite)?(?:\(s\))?:\s*(.+)", re.I)
CREDITS_PAREN_RE = re.compile(r"\((\d{1,2})\s*(?:hrs?|hours?|credits?)\)", re.I)
CREDITS_INLINE_RE = re.compile(r"\b(\d{1,2})\s*(?:credit|credits|hrs?|hours?)\b", re.I)
SHOW_COURSE_RE = re.compile(r"showCourse\('(?P<catoid>\d+)'\s*,\s*'(?P<coid>\d+)'", re.I)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\u00a0", " ")).strip()


def canonical_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")


def detect_year(text: str):
    if not text:
        return None
    match = YEAR_RE.search(text)
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}"


def detect_credits(text: str):
    if not text:
        return None
    match = CREDITS_PAREN_RE.search(text)
    if match:
        return int(match.group(1))
    match = CREDITS_INLINE_RE.search(text)
    if match:
        return int(match.group(1))
    return None


def tidy_title(text: str = ""):
    if not text:
        return ""
    t = text
    t = re.sub(r"^[\-\–:\.\s]+", "", t).strip()
    if PREREQ_RE.match(t):
        return ""
    if len(t) > 160:
        t = t[:160].rstrip()
    return t


def normalize_code(code: str) -> str:
    return re.sub(r"\s+", "", code or "").upper()


class ProgramsSpider(scrapy.Spider):
    name = "programs"
    allowed_domains = ["catalog.southeastern.edu", "www.southeastern.edu"]

    custom_settings = {
        "DOWNLOAD_TIMEOUT": 25,
    }

    def __init__(
        self,
        catoids=None,
        program_hint=None,
        program_key=None,
        include_courses="1",
        max_programs=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        if catoids:
            self.catoids = [int(c.strip()) for c in catoids.split(",") if c.strip().isdigit()]
        else:
            self.catoids = [10, 9, 8, 7, 6, 5]
        self.program_hint = canonical_name(program_hint) if program_hint else ""
        self.requested_program_key = program_key
        self.include_courses = include_courses != "0"
        self.max_programs = int(max_programs) if max_programs and max_programs.isdigit() else None
        self._program_urls = set()
        self._yield_count = 0
        # Track pending course-detail requests per program so we can emit once complete
        self._pending_programs = {}

    def start_requests(self):
        landing_urls = [
            "https://www.southeastern.edu/catalog/",
            CATALOG_HOST + "/",
        ]
        for url in landing_urls:
            yield scrapy.Request(url, callback=self.collect_catoids, dont_filter=True)
        for cid in self.catoids:
            catalog_url = f"{CATALOG_HOST}/content.php?catoid={cid}"
            yield scrapy.Request(
                catalog_url,
                callback=self.parse_catalog,
                cb_kwargs={"catoid": cid},
            )

    def collect_catoids(self, response):
        for href in response.css('a[href*="catoid="]::attr(href)').getall():
            match = re.search(r"catoid=(\d+)", href)
            if match:
                cid = int(match.group(1))
                if cid not in self.catoids:
                    self.catoids.append(cid)

    def parse_catalog(self, response, catoid: int):
        nav_ids = {155}
        for link in response.css('a[href*="navoid="]'):
            text = clean_text(" ".join(link.xpath(".//text()").getall()))
            href = link.attrib.get("href", "")
            match = re.search(r"navoid=(\d+)", href)
            if not match:
                continue
            nav_id = int(match.group(1))
            if PROGRAM_RE.search(text):
                nav_ids.add(nav_id)
        for nav_id in sorted(nav_ids):
            index_url = f"{CATALOG_HOST}/content.php?catoid={catoid}&navoid={nav_id}"
            yield scrapy.Request(
                index_url,
                callback=self.parse_program_index,
                cb_kwargs={"catoid": catoid, "navoid": nav_id},
            )

    def parse_program_index(self, response, catoid: int, navoid: int):
        anchors = response.css('a[href*="preview_program.php"]')
        for anchor in anchors:
            if self.max_programs and self._yield_count >= self.max_programs:
                return
            name = clean_text(" ".join(anchor.xpath(".//text()").getall()))
            if not name:
                continue
            canonical = canonical_name(name)
            if self.program_hint and self.program_hint not in canonical:
                continue
            href = anchor.attrib.get("href", "")
            full_url = urljoin(response.url, href)
            if full_url in self._program_urls:
                continue
            self._program_urls.add(full_url)
            program_meta = {
                "name": name,
                "canonical": canonical,
                "catalog_year": f"catoid-{catoid}",
                "source_url": full_url,
                "catoid": catoid,
                "navoid": navoid,
            }
            if self.include_courses:
                yield response.follow(
                    full_url,
                    callback=self.parse_program_page,
                    cb_kwargs={"program_meta": program_meta},
                )
            else:
                self._yield_count += 1
                yield self.build_program_item(program_meta, [])

    def parse_program_page(self, response, program_meta: dict):
        lines = [
            clean_text(text)
            for text in response.xpath("//body//text()").getall()
            if clean_text(text)
        ]
        joined_text = " ".join(lines)
        detected_year = detect_year(joined_text) or program_meta.get("catalog_year")
        title = clean_text(response.css("h1::text").get()) or program_meta["name"]
        program_meta["catalog_year"] = detected_year
        program_meta["name"] = title
        # Try to gather course detail links (preview_course pages expose prereqs/credits)
        course_links = []
        # New style: onclick="showCourse('5','17895', ...)"
        for a in response.css('a[onclick*="showCourse"]'):
            onclick = a.attrib.get("onclick", "")
            m = SHOW_COURSE_RE.search(onclick)
            if not m:
                continue
            catoid = m.group("catoid")
            coid = m.group("coid")
            course_links.append(f"{CATALOG_HOST}/preview_course_nopop.php?catoid={catoid}&coid={coid}")

        # Legacy preview_course links if present
        legacy_links = response.css('a[href*="preview_course"]::attr(href)').getall()
        course_links.extend(urljoin(response.url, href) for href in legacy_links)

        if self.include_courses and course_links:
            program_key = self.requested_program_key or slugify(program_meta.get("canonical") or program_meta["name"])
            # Set up pending tracker
            self._pending_programs[program_key] = {
                "meta": program_meta,
                "courses": [],
                "expected": len(course_links),
                "source_url": response.url,
            }
            for href in course_links:
                yield response.follow(
                    href,
                    callback=self.parse_course_detail,
                    cb_kwargs={"program_key": program_key},
                    dont_filter=True,
                )
        else:
            # Fallback to legacy text scraping if no links were found
            courses = self.extract_courses(lines)
            self._yield_count += 1
            yield self.build_program_item(program_meta, courses, response.url)

    def parse_course_detail(self, response, program_key: str):
        bucket = self._pending_programs.get(program_key)
        if not bucket:
            return

        # Title line often in <h1> like "MATH 1630 - APPLIED CALCULUS"
        header = clean_text(response.css("h1::text").get() or "")
        code = ""
        title = ""
        if " - " in header:
            code_part, title_part = header.split(" - ", 1)
            code = code_part.strip()
            title = title_part.strip()
        else:
            # fallback: find first course code in header
            match = COURSE_RE.search(header)
            if match:
                code = f"{match.group(1).upper()} {match.group(2)}"
                title = header[match.end():].strip(" -\u00a0")

        # Credits + prereqs from full text (strip tags to avoid missed nodes)
        raw_html = response.text
        tagless = html.unescape(re.sub(r"<[^>]+>", " ", raw_html))
        full_text = clean_text(tagless)
        credits = detect_credits(full_text)

        # Description: text between Credit Hour(s) and the next labelled section
        description = ""
        desc_match = re.search(
            r"Credit Hour\(s\)\s*(.+?)(?:Prereq(?:uisite)?|\bRestrictions:|\bOffered:|\bCourse Component:|$)",
            full_text,
            flags=re.I,
        )
        if desc_match:
            description = desc_match.group(1).strip(" :;-.")

        prereqs = []
        prereq_match = re.search(
            r"Prereq(?:uisite)?(?:\(s\))?:\s*(.+?)(?:Restrictions:|Offered:|Course Component:|$)",
            full_text,
            flags=re.I | re.S,
        )
        if prereq_match:
            raw = prereq_match.group(1)
            pieces = re.split(r",|;|\band\b|\bor\b", raw, flags=re.I)
            for piece in pieces:
                cm = COURSE_RE.search(piece.strip())
                if cm:
                    prereqs.append(f"{cm.group(1).upper()} {cm.group(2)}")

        if code:
            bucket["courses"].append(
                {
                    "code": code,
                    "title": title or "(title unavailable)",
                    "credits": credits,
                    "prereqs": prereqs,
                    "description": description or None,
                }
            )

        # If we've collected all course details, emit the program item
        if len(bucket["courses"]) >= bucket["expected"]:
            self._pending_programs.pop(program_key, None)
            self._yield_count += 1
            yield self.build_program_item(bucket["meta"], bucket["courses"], bucket.get("source_url"))

    def extract_courses(self, lines):
        courses = []
        seen = set()
        for idx, line in enumerate(lines):
            match = COURSE_RE.search(line)
            if not match:
                continue
            code = f"{match.group(1).upper()} {match.group(2)}".replace("  ", " ").strip()
            code_key = normalize_code(code)
            if code_key in seen:
                continue
            seen.add(code_key)
            tail = line[match.end():].strip()
            title_guess = tidy_title(tail) or tidy_title(lines[idx + 1] if idx + 1 < len(lines) else "")
            credits = detect_credits(line) or (
                detect_credits(lines[idx + 1]) if idx + 1 < len(lines) else None
            )
            prereqs = self.collect_prereqs(lines, idx)
            courses.append(
                {
                    "code": code,
                    "title": title_guess or "(title unavailable)",
                    "credits": credits,
                    "prereqs": prereqs,
                }
            )
        return courses

    def collect_prereqs(self, lines, start_idx):
        prereqs = []
        limit = min(len(lines), start_idx + 6)
        for j in range(start_idx, limit):
            match = PREREQ_RE.search(lines[j])
            if not match:
                continue
            raw = match.group(1)
            pieces = re.split(r",|;|\band\b|\bor\b", raw, flags=re.I)
            for piece in pieces:
                cm = COURSE_RE.search(piece.strip())
                if cm:
                    prereqs.append(f"{cm.group(1).upper()} {cm.group(2)}")
            if prereqs:
                break
        return prereqs

    def build_program_item(self, program_meta: dict, courses, source_url=None):
        requested_key = self.requested_program_key or slugify(program_meta.get("canonical") or program_meta["name"])
        year_fragment = ""
        if program_meta.get("catalog_year"):
            year_fragment = re.sub(r"[^0-9-]", "", program_meta["catalog_year"])
        program_key = requested_key
        if requested_key == slugify(program_meta.get("canonical") or "") and year_fragment:
            program_key = f"{requested_key}-{year_fragment}"
        return {
            "program": {
                "key": program_key,
                "name": program_meta["name"],
                "catalog_year": program_meta.get("catalog_year"),
                "catoid": program_meta.get("catoid"),
                "navoid": program_meta.get("navoid"),
            },
            "courses": courses,
            "source_url": source_url or program_meta.get("source_url"),
            "_source": "web",
        }
