# Search Console sitemap investigation — 2026-10-23

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
