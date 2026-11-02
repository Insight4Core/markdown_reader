# Search Console sitemap investigation — 2026-10-23

## Follow-up — 2026-11-02

- Authenticated Search Console access succeeded. Comparing the complete reporting weeks **2026-10-25–31** and **2026-10-18–24**: clicks **12 vs 6**, impressions approximately **890 vs 588**, CTR **1.3% vs 1.0%**, average position **5.6 vs 7.8**. The latest week's 12 clicks all belonged to the existing Windows guide. Small samples and different query mixes do not establish that the last website update caused this increase.
- The sitemap record points to the correct, full `/markdown_reader/sitemap.xml` URL—not the host-root `/sitemap.xml`. Its detail report still says **Sitemap could not be read**, last read **2026-10-23**, with **0 discovered pages**. It provides no specific HTTP/parser cause.
- A new **Google live URL inspection at 2026-11-02 09:11:20** (time shown in the report) passed: **crawl allowed Yes**, **page fetch Successful**, **indexing allowed Yes**, Google Inspection Tool smartphone. This confirms today's inspection-tool fetch, not recovery of the sitemap crawler's report. No sitemap filename churn, root-site creation, deletion, or repeated submission was performed.
- Public checks found all 11 sitemap URLs returning HTTP 200 with matching canonical URLs and no HTML `noindex`. The deployed Windows guide, analytics module, installer-link module, and sitemap matched the local committed files before this update.
- GA4's **2026-10-05–2026-11-01** event report was read: **4 page_view events / 2 users**, **1 download_click event / 1 user**. These may include earlier developer verification. They are not evidence of organic download conversion, nor do their denominators match Search Console clicks or GitHub download counters.
- GitHub's installer counters at the time of the check were **154** (Windows 105, macOS 14, Linux 35), up **3** from the saved October 29 baseline. All three new installer counts belong to the v0.10.0 Windows `.exe`; updater payloads increased separately from 12 to 13. No installer binary was fetched by these checks.
- This update moves a short source excerpt and the existing real reading screenshot before the Windows installer CTA, discloses that the screenshot was captured on macOS, and collapses the longer source excerpt. Existing title, canonical, method anchors, and other-language pages remain intact. Only this substantively changed guide receives a new sitemap `lastmod`.

### Analytics verification

- `node --test tests/website-analytics.test.mjs` covers download classifications, exclusions, all three button placements, latest-release updates, and offline/rate-limit fallbacks.
- Browser checks on the actual site code passed at widths 1280, 768, 390, and 320; installer API failure and JavaScript-disabled fallback also passed.
- An isolated production-host browser test intercepted **all** external requests. It verified no tracking before consent or after decline, one explicit page view after consent, three correctly attributed installer-click events, query/hash removal, and withdrawal behavior. It sent **no** GA4 events or installer downloads. This is client behavior verification, not proof of new event ingestion into the live account.
- After the user's explicit approval, five **event-scoped** custom dimensions were saved in the **Pyrus Website** property on 2026-11-02: 按钮位置 → `button_location`, 目标平台 → `target_platform`, 下载类型 → `download_kind`, 安装包格式 → `artifact_format`, 页面语言 → `page_language`. The account list displayed all five saved mappings. This registers existing parameters, not new data collection. Allow 24–48 hours for newly processed dimension data; historical dimension values are not backfilled. No key-event, consent, advertising, access, or retention setting was changed.

### Remaining sitemap action

The exact cause remains unconfirmed. Preserve the successful live-test result and the failing sitemap report. Since Google's documentation says failed sitemap retries eventually stop, one deliberate resubmission of this **same tested URL** can be considered after deployment; do not repeatedly resubmit or rename it. The success criterion is still **Success** with discovered URLs, not a submission-accepted notification. For this small internally linked site, this report alone is not evidence that all pages are blocked from search.

## Follow-up — 2026-10-29

- Public sitemap GET still returns **HTTP 200**, `application/xml`; the deployed XML remains well-formed. The host-root robots.txt still returns 404. These public checks do **not** confirm that Search Console's sitemap report has recovered.
- No authenticated Search Console or GA4 access was available in this session. Current queries, impressions, ranking, CTR, and download-link conversion were **not** read. Do not infer an indexing failure from an empty `site:` search or claim a traffic improvement from the changes below.
- GitHub's latest published release was verified as **v0.10.0**. Both homepages now describe Recent changes, reading tabs, and the three export actions; SoftwareApplication metadata no longer advertises 0.8.3.
- Existing Windows and Mac guides retain their URLs and titles. Their new sections answer Markdown-to-PDF and formatted-copy questions. The bilingual folder guide explains changed-note states, actual tab shortcuts, and export limitations. Homepage links point directly to those sections.
- Only the six substantively updated pages receive a 2026-10-29 sitemap `lastmod`. No new sitemap filename, duplicate keyword pages, or speculative indexing fix was introduced.

### After deploying this update

1. Check the two homepages, the Windows/Mac PDF sections, and the two folder guides on the live Pages site. The localhost preview is not production.
2. Inspect the four updated guide URLs in Search Console and optionally request a recrawl once per URL. Do not repeatedly resubmit the same sitemap to compensate for unknown traffic performance.
3. Review the sitemap report separately. Its success condition remains **Success** and discovered page URLs; a normal public HTTP response is not enough to mark the issue fixed.
4. Save Search Console's latest 28-day **Queries** and **Pages** exports. Compare the existing open-.md query group with any emerging Markdown/PDF queries after Google recrawls. PDF-related demand is a content hypothesis, not a measured keyword-volume claim.
5. Review consenting sessions with `download_click` by landing page and language in GA4. The event measures a click to the GitHub release page, not a completed binary download or active app user. Low-count fluctuations should not trigger another title change.

The existing analytics implementation and consent behavior are unchanged; no app telemetry SDK was added.

---

Property: `https://insight4core.github.io/markdown_reader/`

Sitemap: `https://insight4core.github.io/markdown_reader/sitemap.xml`

## Verified observations

- The sitemap's public GET response is **HTTP 200**, `Content-Type: application/xml`, 3,879 bytes before today's guide update. The deployed body matched the repository file.
- A request with a `Googlebot` user-agent also returned 200 and the same body. This is a local HTTP check, **not** proof of access from Google's infrastructure.
- `xmllint --noout` passes. The file contains 11 page URLs, all using HTTPS and this property's host and path. All 11 public URLs returned 200 during the check.
- **Google URL Inspection live test** of the exact sitemap URL passed at 2026-10-23 09:35:49 (time displayed by Search Console): crawl allowed **Yes**, page fetch **Successful**, indexing allowed **Yes**. The displayed agent was Google Inspection Tool smartphone.
- Both **Manual actions** and **Security issues** reports show no issues detected.
- The actual host-root `https://insight4core.github.io/robots.txt` returns 404. Google's documented handling treats a robots.txt 404 as no crawl restrictions, not a block.
- This project's `docs/robots.txt` is served under `/markdown_reader/robots.txt`. A file under a subdirectory is not the host's effective robots.txt. Do not assume its rules control Googlebot, and do not create a separate root website merely to work around this report.

## Submission outcome

The exact sitemap was resubmitted once on 2026-10-23. Search Console displayed **“Sitemap submitted successfully”**. After closing that confirmation, the sitemap report **still showed “Couldn't fetch” / “Sitemap could not be read,” 0 discovered pages**, and its detail page displayed 2026/10/23 as the last-read date.

**The report is not confirmed fixed.** Submission acceptance is not successful fetch/parse. The report does not expose a specific HTTP or parser error, and today's inspection success cannot establish what happened in earlier attempts or the sitemap crawler's latest attempt. Possible transient or crawl-demand causes are hypotheses, not a verified diagnosis. The site's already indexed pages do not depend on this report becoming green.

## What to do next

1. Recheck this same sitemap report after Google has had time to retry. The completion condition is **Success**, with the sitemap recognized and page URLs discovered. Do not repeatedly delete/resubmit a valid sitemap or churn its filename without new evidence.
2. If it still fails, run the exact sitemap URL's live inspection again and expand **Page availability**. Record the test time and any fetch/robots error. A normal browser or curl returning 200 is not sufficient on its own.
3. If Google's live fetch continues to pass but the sitemap report fails, preserve both results for a Search Console support/community investigation. GitHub Pages does not expose this site's raw Googlebot request logs, so the exact failing request cannot be reconstructed from this repository.
4. Keep the website internally linked and its Windows/macOS guides useful. The Windows guide's `lastmod` was updated only because its content actually changed on 2026-10-23; that is not claimed as a fix for the fetch error.

## Official references

- [Search Console Sitemaps report: live-test procedure, status meanings, and fetch errors](https://support.google.com/webmasters/answer/7451001?hl=en)
- [Google robots.txt location and HTTP status handling](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
