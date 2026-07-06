async (page) => {
  const PERIOD_CODE = "202610";
  const PERIOD_LABEL = "Primer Semestre 2026/2027";

  await page.goto("https://catalogodecursos.usfq.edu.ec/dashboard/home", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("select", { state: "visible", timeout: 20000 });

  const selects = await page.locator("select").all();
  let periodSelected = false;
  for (const sel of selects) {
    const opts = await sel.evaluate((el) =>
      Array.from(el.options).map((o) => o.value),
    );
    if (opts.includes(PERIOD_CODE)) {
      await sel.selectOption(PERIOD_CODE);
      periodSelected = true;
      break;
    }
  }
  if (!periodSelected) throw new Error("Period " + PERIOD_CODE + " not found");

  await page
    .locator("button:has-text('Actualizar'), button:has-text('Update Courses')")
    .first()
    .click();
  await page.waitForSelector("table tbody tr", { timeout: 30000 });
  await page.waitForTimeout(2000);

  for (const sel of await page.locator("select").all()) {
    const opts = await sel.evaluate((el) =>
      Array.from(el.options).map((o) => o.value),
    );
    if (opts.includes("100")) {
      await sel.selectOption("100");
      await page.waitForTimeout(2000);
      break;
    }
  }

  const allRows = [];
  let pageNum = 1;
  while (true) {
    const raw = await page.evaluate(() => {
      const rows = document.querySelectorAll("table tbody tr");
      const results = [];
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 10) continue;
        const infoCell = cells[3];
        const badge = infoCell.querySelector(".badge");
        const title = badge ? badge.innerText.trim() : "";
        let courseType = "Teoría";
        for (const p of infoCell.querySelectorAll("p")) {
          if (p.innerText.includes("Curso de:")) {
            const b = p.querySelector("b");
            if (b) courseType = b.innerText.trim();
            break;
          }
        }
        let groupLetters = [];
        for (const p of infoCell.querySelectorAll("p")) {
          if (p.innerText.includes("Agrupado con")) {
            const matches =
              p.innerText.match(/\|\s*([A-Z][A-Z0-9]{0,2})\s*\|/g) || [];
            groupLetters = matches.map((m) => m.replace(/\|/g, "").trim());
            break;
          }
        }
        const days = [];
        let horarioP = null;
        for (const p of infoCell.querySelectorAll("p")) {
          if (p.innerText.includes("Horario:")) {
            horarioP = p;
            break;
          }
        }
        if (!horarioP) horarioP = infoCell.querySelector("p.mb-2");
        if (horarioP) {
          for (const b of horarioP.querySelectorAll("b")) {
            const txt = b.innerText.trim();
            if (
              [
                "Lunes",
                "Martes",
                "Miércoles",
                "Jueves",
                "Viernes",
                "Sábado",
              ].includes(txt)
            )
              days.push(txt);
          }
        }
        let startTime = null,
          endTime = null;
        if (horarioP) {
          for (const b of Array.from(horarioP.querySelectorAll("b"))) {
            const m = b.innerText.match(/(\d{4})\s*-\s*(\d{4})/);
            if (m) {
              startTime = m[1].slice(0, 2) + ":" + m[1].slice(2);
              endTime = m[2].slice(0, 2) + ":" + m[2].slice(2);
              break;
            }
          }
        }
        let paralelo = null;
        for (const p of infoCell.querySelectorAll("p")) {
          if (p.innerText.includes("Paralelo:")) {
            const b = p.querySelector("b");
            if (b) paralelo = b.innerText.trim();
            break;
          }
        }
        const totalSlots = parseInt(cells[8].innerText.trim()) || null;
        const enrolled = parseInt(cells[9].innerText.trim()) || null;
        const available =
          totalSlots !== null && enrolled !== null
            ? totalSlots - enrolled
            : null;
        results.push({
          course_code: cells[1].innerText.trim(),
          nrc: cells[2].innerText.trim(),
          title,
          type: courseType,
          group_letters: groupLetters,
          paralelo,
          days,
          start_time: startTime,
          end_time: endTime,
          teacher: cells[5].innerText.trim() || null,
          credits: parseInt(cells[6].innerText.trim()) || null,
          college: cells[7].innerText.trim() || null,
          total: totalSlots,
          available,
        });
      }
      return results;
    });

    for (const r of raw) {
      const nrc = (r.nrc || "").trim();
      if (/^\d{4,6}$/.test(nrc)) allRows.push(r);
    }

    const nextBtn = page.locator(
      "li.page-item:not(.disabled) a.page-link:has-text('Next')",
    );
    if ((await nextBtn.count()) === 0) break;
    const lastNrc = allRows.length ? allRows[allRows.length - 1].nrc : "";
    await nextBtn.first().click();
    try {
      await page.waitForFunction(
        (nrc) =>
          document
            .querySelector("table tbody tr td:nth-child(3)")
            ?.innerText?.trim() !== nrc,
        lastNrc,
        { timeout: 15000 },
      );
    } catch {
      await page.waitForTimeout(2000);
    }
    pageNum++;
    if (pageNum > 200) break;
  }

  return {
    period_code: PERIOD_CODE,
    period: PERIOD_LABEL,
    count: allRows.length,
    courses: allRows,
  };
}
