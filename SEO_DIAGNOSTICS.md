# Search Console sitemap investigation — 2026-10-23

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
