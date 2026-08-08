---
title: Data sources and updates
---

# Data sources and updates

TC39 Atlas reads the [TC39 Dataset](https://tc39.es/dataset/) and proposal READMEs from GitHub in a daily GitHub Actions job. Structured status comes from the official dataset, while proposal text comes from each repository.

The website and MCP server consume the same versioned JSON dataset with manifest and SHA-256 validation. A failed synchronization or build does not replace the last successful release.
