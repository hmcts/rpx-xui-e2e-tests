## CI assets

This folder documents where automation pipelines live and how they are expected to be used.

- `../Jenkinsfile_CNP` – PR/branch checks (lint + Chromium smoke suite). Add this Jenkinsfile to the HMCTS Jenkins multibranch job pointing at this repo.
- `../Jenkinsfile_nightly` – Scheduled nightly job (weekday evenings by default) with parameters for environment base URL, tags, browser, and worker count. Use this once the regression/a11y/perf suites mature.

Future additions:

- BrowserStack helpers for Edge/Safari and any Docker-compose services that mirror the Playwright Skeleton project.
- GitHub Actions workflow for quick lint/test feedback before Jenkins runs.
