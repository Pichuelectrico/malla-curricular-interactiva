"""
Selenium browser session for USFQ catalog scraping.

Uses a persistent Chrome profile (user-data-dir) so Microsoft SSO sessions
survive ~30 h.  Login auto-fill runs **once** per session check — no retry loop.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from typing import Optional

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

log = logging.getLogger("offer-scraper")

CATALOG_URL = "https://catalogodecursos.usfq.edu.ec/dashboard/home"
TENANT_ID = "9f119962-8c62-431c-a8ef-e7e0a42d11fc"
PROFILE_DIR = os.path.join(os.path.dirname(__file__), ".browser_profile")

EXTRACT_JS = """
() => {
  const rows = document.querySelectorAll('table tbody tr');
  const results = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 10) continue;

    const infoCell = cells[3];
    const badge = infoCell.querySelector('.badge');
    const title = badge ? badge.innerText.trim() : '';

    let courseType = 'Teoría';
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Curso de:')) {
        const b = p.querySelector('b');
        if (b) courseType = b.innerText.trim();
        break;
      }
    }

    let groupLetters = [];
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Agrupado con')) {
        const matches = p.innerText.match(/\\|\\s*([A-Z][A-Z0-9]{0,2})\\s*\\|/g) || [];
        groupLetters = matches.map(m => m.replace(/\\|/g, '').trim());
        break;
      }
    }

    const days = [];
    let horarioP = null;
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Horario:')) { horarioP = p; break; }
    }
    if (!horarioP) horarioP = infoCell.querySelector('p.mb-2');
    if (horarioP) {
      for (const b of horarioP.querySelectorAll('b')) {
        const txt = b.innerText.trim();
        if (['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].includes(txt))
          days.push(txt);
      }
    }

    let startTime = null, endTime = null;
    if (horarioP) {
      for (const b of Array.from(horarioP.querySelectorAll('b'))) {
        const m = b.innerText.match(/(\\d{4})\\s*-\\s*(\\d{4})/);
        if (m) {
          startTime = m[1].slice(0,2) + ':' + m[1].slice(2);
          endTime   = m[2].slice(0,2) + ':' + m[2].slice(2);
          break;
        }
      }
    }

    let paralelo = null;
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Paralelo:')) {
        const b = p.querySelector('b');
        if (b) paralelo = b.innerText.trim();
        break;
      }
    }

    const totalSlots = parseInt(cells[8].innerText.trim()) || null;
    const enrolled   = parseInt(cells[9].innerText.trim()) || null;
    const available  = (totalSlots !== null && enrolled !== null)
                        ? totalSlots - enrolled : null;

    results.push({
      course_code:   cells[1].innerText.trim(),
      nrc:           cells[2].innerText.trim(),
      title,
      type:          courseType,
      group_letters: groupLetters,
      paralelo,
      days,
      start_time:    startTime,
      end_time:      endTime,
      teacher:       cells[5].innerText.trim() || null,
      credits:       parseInt(cells[6].innerText.trim()) || null,
      college:       cells[7].innerText.trim() || null,
      total:         totalSlots,
      available,
    });
  }
  return results;
}
"""


class BrowserSession:
    """Chrome with persistent profile for USFQ catalog access."""

    def __init__(self, headed: bool = False):
        os.makedirs(PROFILE_DIR, exist_ok=True)
        opts = Options()
        opts.add_argument(f"--user-data-dir={PROFILE_DIR}")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--window-size=1280,900")
        opts.add_experimental_option("excludeSwitches", ["enable-automation"])
        if not headed:
            opts.add_argument("--headless=new")
        self.driver = webdriver.Chrome(options=opts)
        self._headed = headed

    @property
    def url(self) -> str:
        return self.driver.current_url

    def close(self) -> None:
        self.driver.quit()

    def goto(self, url: str, timeout: int = 60) -> None:
        self.driver.set_page_load_timeout(timeout)
        self.driver.get(url)

    def _on_dashboard(self) -> bool:
        return "catalogodecursos.usfq.edu.ec/dashboard" in self.url

    def _needs_login(self) -> bool:
        return (
            "login.microsoftonline.com" in self.url
            or "catalogodecursos.usfq.edu.ec/login" in self.url
        )

    def _dismiss_stay_signed_in(self) -> bool:
        try:
            btn = self.driver.find_element(By.ID, "idBtn_Back")
            if btn.is_displayed():
                btn.click()
                log.info("Dismissed 'Stay signed in?'")
                return True
        except NoSuchElementException:
            pass
        return False

    def auto_fill_credentials(self, username: str, password: str) -> None:
        """Submit Microsoft login form once (best-effort)."""
        try:
            email = WebDriverWait(self.driver, 20).until(
                EC.visibility_of_element_located((
                    By.CSS_SELECTOR,
                    "input[type='email'], input[name='loginfmt']",
                ))
            )
            email.clear()
            email.send_keys(username)
            email.send_keys(Keys.RETURN)
            log.info("Email submitted.")

            pwd = WebDriverWait(self.driver, 15).until(
                EC.visibility_of_element_located((
                    By.CSS_SELECTOR,
                    "input[type='password'], input[name='passwd']",
                ))
            )
            pwd.clear()
            pwd.send_keys(password)
            pwd.send_keys(Keys.RETURN)
            log.info("Password submitted — waiting for redirect…")
        except TimeoutException:
            log.warning("Could not auto-fill credentials (page may already be past login).")

    def wait_for_dashboard(self, timeout: float = 300) -> bool:
        """Poll until dashboard loads or timeout."""
        deadline = time.time() + timeout
        dismissed = False
        while time.time() < deadline:
            time.sleep(0.8)
            if self._on_dashboard():
                try:
                    WebDriverWait(self.driver, 20).until(
                        EC.visibility_of_element_located((By.CSS_SELECTOR, "select"))
                    )
                except TimeoutException:
                    pass
                return True
            if (
                not dismissed
                and f"{TENANT_ID}/login" in self.url
                and "oauth2" not in self.url
            ):
                dismissed = self._dismiss_stay_signed_in()
        return False

    def ensure_logged_in(self, username: str = "", password: str = "") -> bool:
        """
        Open catalog; return True if dashboard is reachable.
        Auto-login runs at most once — never in a tight loop.
        """
        log.info("Opening catalog…")
        self.goto(CATALOG_URL)

        if self._on_dashboard():
            log.info("Session alive — dashboard loaded.")
            return True

        if not self._needs_login():
            if self.wait_for_dashboard(timeout=60):
                log.info("Dashboard loaded after redirect.")
                return True
            log.warning("Timed out waiting for catalog.")
            return False

        if not username or not password:
            log.warning("Redirected to login — run: python scrape.py login")
            return False

        log.info("Session expired — attempting one-time auto-login…")
        self.auto_fill_credentials(username, password)
        if self.wait_for_dashboard(timeout=180):
            log.info("Auto-login succeeded.")
            return True

        log.warning("Auto-login failed — run: python scrape.py login")
        return False

    def cmd_login(self, username: str, password: str) -> None:
        """Headed login: manual or auto-fill, persist profile."""
        auto = bool(username and password)
        log.info("Opening browser%s…", " with auto-fill" if auto else " for manual login")
        log.info("Profile dir: %s", PROFILE_DIR)

        self.goto(CATALOG_URL)
        log.info("Navigated to catalog. Current URL: %s", self.url)

        if auto:
            self.auto_fill_credentials(username, password)

        log.info("Waiting for dashboard (up to 5 min)…")
        if not auto:
            log.info("  → Please log in manually in the browser window.")

        if not self.wait_for_dashboard(timeout=300):
            log.error("Dashboard not reached within 5 minutes.")
            sys.exit(1)

        log.info("Dashboard reached. Session saved.")
        time.sleep(3)

    def _select_period(self, period_code: str) -> None:
        for sel_el in self.driver.find_elements(By.CSS_SELECTOR, "select"):
            select = Select(sel_el)
            values = [o.get_attribute("value") for o in select.options]
            if period_code in values:
                select.select_by_value(period_code)
                log.info("Period %s selected.", period_code)
                return
        log.error("Period code %s not found in any <select>.", period_code)
        sys.exit(1)

    def load_period(self, period_code: str) -> None:
        log.info("Selecting period %s…", period_code)
        self._select_period(period_code)

        btn = WebDriverWait(self.driver, 15).until(
            EC.element_to_be_clickable((
                By.XPATH,
                "//button[contains(., 'Actualizar') or contains(., 'Update Courses')]",
            ))
        )
        btn.click()
        WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr"))
        )
        log.info("Course table loaded.")

        for sel_el in self.driver.find_elements(By.CSS_SELECTOR, "select"):
            select = Select(sel_el)
            values = [o.get_attribute("value") for o in select.options]
            if "100" in values:
                select.select_by_value("100")
                time.sleep(1.5)
                log.info("Items per page set to 100.")
                break

    def _extract_page(self) -> list[dict]:
        raw = self.driver.execute_script(f"return ({EXTRACT_JS})()")
        return raw if isinstance(raw, list) else []

    def scrape_all(self, period: str, period_code: str, CourseRow) -> list:
        """Scrape all pages for the loaded period. CourseRow is the dataclass type."""
        self.load_period(period_code)

        all_rows = []
        page_num = 1

        while True:
            log.info("Scraping page %d…", page_num)
            raw = self._extract_page()
            log.info("  → %d rows (total so far: %d)", len(raw), len(all_rows) + len(raw))

            for r in raw:
                nrc = r.get("nrc", "").strip()
                if not re.fullmatch(r"\d{4,6}", nrc):
                    continue
                teacher_raw = (r.get("teacher") or "").replace("\n", " ").strip() or None
                all_rows.append(CourseRow(
                    nrc=nrc,
                    course_code=r.get("course_code", "").strip(),
                    title=r.get("title", "").strip(),
                    type=r.get("type", "Teoría"),
                    group_letters=r.get("group_letters", []),
                    paralelo=r.get("paralelo"),
                    days=r.get("days", []),
                    start_time=r.get("start_time"),
                    end_time=r.get("end_time"),
                    teacher=teacher_raw,
                    credits=r.get("credits"),
                    college=r.get("college"),
                    available=r.get("available"),
                    total=r.get("total"),
                    period=period,
                    period_code=period_code,
                ))

            try:
                next_btn = self.driver.find_element(
                    By.XPATH,
                    "//li[contains(@class,'page-item') and not(contains(@class,'disabled'))]"
                    "//a[contains(@class,'page-link') and normalize-space()='Next']",
                )
            except NoSuchElementException:
                log.info("No more pages.")
                break

            last_nrc = all_rows[-1].nrc if all_rows else ""
            next_btn.click()

            try:
                WebDriverWait(self.driver, 15).until(
                    lambda d: d.find_element(
                        By.CSS_SELECTOR, "table tbody tr td:nth-child(3)"
                    ).text.strip() != last_nrc
                )
            except TimeoutException:
                time.sleep(2)

            page_num += 1

        log.info("Total scraped: %d courses", len(all_rows))
        return all_rows

    def list_periods(self) -> list[dict]:
        self.goto(CATALOG_URL)
        WebDriverWait(self.driver, 20).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, "select"))
        )
        periods: list[dict] = []
        for sel_el in self.driver.find_elements(By.CSS_SELECTOR, "select"):
            select = Select(sel_el)
            for opt in select.options:
                val = opt.get_attribute("value") or ""
                label = opt.text.strip()
                if val and re.fullmatch(r"\d{6}", val):
                    periods.append({"code": val, "label": label})
            if periods:
                break
        return periods
