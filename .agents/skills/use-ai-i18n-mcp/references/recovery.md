# Error recovery

## Empty or stale extraction

If the first translation list returns no source files, run one full Build for the same target app and
retry once. If the retry remains empty, report that the build has no extracted messages. Do not scan
sibling apps.

## MCP errors

First follow the returned `next_action`. Use this table only when more context is needed or an older
server does not return that field.

| Error | Recovery |
| --- | --- |
| `I18N_DIRECTORY_NOT_FOUND` or `I18N_DIRECTORY_NOT_ABSOLUTE` | Recompute Vite root plus `aiI18n.directory`, then use an absolute path. |
| `REQUIRED_PROTOCOL_FILE_MISSING` or `REQUIRED_PROTOCOL_DIRECTORY_MISSING` | Run one full Build for the same app and retry once. |
| `INVALID_PROTOCOL_JSON`, `INVALID_PROTOCOL_FILE`, or `PROTOCOL_PATH_NOT_DIRECTORY` | Restore or repair the reported protocol path, run one full Build, then retry. |
| `DUPLICATE_EXTRACTED_SOURCE` | Remove the duplicate extracted JSON files for the reported source, run one full Build, then retry. |
| `MESSAGE_ID_SOURCE_CONFLICT`, `MESSAGE_MISSING_FROM_TRANSLATIONS`, or `MESSAGE_METADATA_MISMATCH` | Rebuild with a clean extracted directory, then list again. Report the returned details if the error persists. |
| `SOURCE_FILE_NOT_FOUND` | List with `view: "summary"` and without the filter, then copy an exact returned `source_file`. |
| `MESSAGE_NOT_FOUND` | List again and copy the exact returned `message` object. |
| `MESSAGE_NOT_FOUND_IN_SOURCE_FILE` | List again with `include_source_files: true`, then keep only exact files that contain the selected message. |
| `DUPLICATE_TARGET_CONFLICT` | Choose one value for the repeated message and locale, then retry the batch. |
| `TRANSLATION_CONFLICT` | Re-list current values. Set `overwrite_existing: true` only with explicit user approval. |
| `TEMPLATE_TOKEN_MISMATCH` | Compare `expected_tokens` and `received_tokens`; add every entry from `missing_tokens`, remove every entry from `unexpected_tokens`, then retry. Repeated tokens are significant. |
| `UNKNOWN_LOCALE` | Use locale values from `aiI18n({ locales })`, not display labels. |
| `INVALID_CURSOR` | Restart the corresponding list without the cursor. |
| `INVALID_OVERRIDE_ID` | List overrides again and copy the returned ID exactly. |
| `INVALID_ORPHAN_ID` | Run a full Build, list orphan messages again, and copy the returned ID exactly. |
| `ORPHAN_MESSAGE_REACTIVATED` | Do not retry deletion from the stale list. Run a full Build, re-list, show the changed result, and request approval again. |
| `ORPHAN_ID_CONFLICT` | Stop cleanup and report the returned error details; do not retry deletion. |
| `DUPLICATE_TARGET` | Remove repeated targets and retry. |

## Tool unavailable

If the MCP tools are unavailable, explain that `@ai-i18n/mcp` must be registered locally. Do not
silently replace the workflow with broad source-tree editing or direct protocol-file writes.
