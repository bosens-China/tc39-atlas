---
title: Data sources and updates
---

# Data sources and updates

TC39 Atlas reads the [TC39 Dataset](https://tc39.es/dataset/) and proposal READMEs from GitHub in a daily GitHub Actions job. Structured status comes from the official dataset, while proposal text comes from each repository.

The website consumes a versioned JSON dataset with manifest and SHA-256 validation. A failed synchronization or build does not replace the last successful release.

The dataset's “checked at” value records the latest successful fetch and comparison. A change's “detected at” value records when this site first found it during a daily snapshot comparison, not the exact time TC39 made the upstream edit. A successful daily job refreshes the check time and republishes period pages even when no proposal changed.
