---
title: Data sources and updates
---

# Data sources and updates

TC39 Atlas reads the [TC39 Dataset](https://tc39.es/dataset/) and proposal READMEs from GitHub in a daily GitHub Actions job. Structured status comes from the official dataset, while proposal text comes from each repository.

The website consumes a versioned JSON dataset with manifest and SHA-256 validation. A failed synchronization or build does not replace the last successful release.

The dataset's `Asia/Shanghai` daily update date is the stable anchor for rolling change windows, while “checked at” records the actual time of the latest successful fetch and comparison. A change's “detected at” value records when this site first found it during a daily snapshot comparison, not the exact time TC39 made the upstream edit.

Scheduled jobs and explicit manual synchronization advance the daily update. Ordinary code pushes, Pull Request CI, and repeated website builds reuse the committed data without moving the reporting range. The latest daily update compares the previous successful update with the current one; the remaining pages show changes from the last 7 days, month, 3 months, and year.
