# Tool contracts

## Shared identity and pagination

Start with `ai_i18n_list_translations` and pass only `i18n_directory`. Its default `view: "missing"`
discovers source files and returns writable missing entries.

- Follow `next_cursor` until `has_more` is false unless the user asked for a sample.
- Lists request 100 records by default and accept `limit` up to 500. A size-limited page may contain
  fewer records; continue with `next_cursor`.
- Use `view: "summary"` for progress counts and `view: "all"` only when existing values are required.
- Use `message.source` as translation input and `message.comment` as author context.
- Use `missing_locales` as the default target locale set.
- Copy the complete `message` object into write tools. Internal message IDs are not public inputs.
- List items omit `source_files` by default. Set `include_source_files: true` only when the task needs
  the complete shared occurrence range or per-file impact reporting. The `source_files` input can
  still filter list operations and is not part of write identity.
- Set `include_occurrences: true` only when a message needs source context. Each returned occurrence
  pairs one `source_file` with all extracted line and column locations for that shared message. Read
  nearby source from the target workspace; MCP does not return source snippets. Occurrences are not
  part of write identity.

One message update affects every source file where that message occurs.

Batch schemas merge the same unknown top-level item key into one validation error with its occurrence
count, first index, valid keys, and a retry action. Remove the invalid key from every item before
retrying; do not fix only the first reported index.

Physical files under `extracted/` use the normalized source's SHA-256 as their filename. The JSON
`source` field is authoritative, and MCP list filters read that value; never derive `source_files`
from a hash filename.

## Automatic translations

Use `ai_i18n_set_translations` for ordinary translation work. Each update contains
`message: { source, comment? }`, `locale`, and `value`.

- Each batch accepts at most 500 inputs.
- Leave `overwrite_existing` unset or false unless the user explicitly requests replacement.
- Identical repeated targets and values are applied once and reported through `deduplicated_count`.
- Different values for one message and locale fail the whole batch.
- Empty strings are valid translations.

Use `ai_i18n_clear_translations` only when the user asks to reset specific automatic translations.
It sets the selected fields to `null` without removing messages, locales, or human reviews.

## Orphan Translation Memory

Use orphan tools only when the user explicitly requests an orphan audit or cleanup. They are not part
of ordinary translation, human review, or completion verification.

1. Run one full Vite Build for the selected app. Dev extraction is incomplete until every module is
   requested and is not safe evidence for deletion.
2. Call `ai_i18n_list_orphan_messages`, follow every page in the requested scope, and show the user the
   messages and retained translations.
3. After the user explicitly approves deletion, copy the returned opaque `orphan_id` values into
   `ai_i18n_delete_orphan_messages`. Never construct an orphan ID.
4. Repeat the list to verify the remaining orphan set.

The delete tool removes complete messages from the configured Translation Memory, not individual locale values. It
revalidates the whole batch against the current extracted set before writing; if any target is active,
the whole batch fails. Rebuild, re-list, show the changed result, and obtain approval again. Do not run
Build or edit protocol files concurrently with cleanup.

Orphan translation deletion never removes `overrides.json` values. Inspect and delete orphaned human
review values separately through the override tools and only with explicit approval.

## Human review

Human decisions belong in `overrides.json`, not the JSON or SQLite Translation Memory.

Use `ai_i18n_list_overrides` to inspect current values, including orphaned values. Use
`ai_i18n_set_overrides` only when the user explicitly requests or approves human review wording:

- Omit `files` for a global review across the current Vite app.
- Provide one or more exact `source_file` values in `files` for a file-scoped review. Every selected
  file must currently contain the listed message.
- `comment` is part of the copied public `message` object and can be combined with either global or
  file scope. Do not add or remove it to simulate file scope.
- File paths are normalized POSIX paths relative to the Vite root. Copy them exactly from list
  results; never use absolute paths, substrings, or globs.
- Setting an override is an upsert and may replace an existing human value.

Resolution priority is file + comment, global + comment, file default, global default, automatic
Translation Memory, then source fallback. File-scoped list items always include their identity
`files`; `source_files` remains optional occurrence evidence and is returned only when requested.

To remove a human value, list it first and pass the returned opaque `override_id` to
`ai_i18n_delete_overrides`. Never construct an override ID.

## Write and verification boundaries

- Translation tools use sharded JSON when `storage.json` is absent and the user-level SQLite database
  when its SQLite marker exists. Never edit either storage directly while the tools are available.
- A missing local SQLite database is not a project-path error. Follow the returned full-Build recovery
  action when the selected cache lacks current message metadata.
- Human review tools modify only `overrides.json`.
- MCP does not modify `extracted/` or `locales/`.
- Preserve every template token before writing.
- On `TEMPLATE_TOKEN_MISMATCH`, compare `expected_tokens` with `received_tokens`, insert every entry
  from `missing_tokens`, remove every entry from `unexpected_tokens`, and retry the corrected whole
  batch. Repeated tokens are significant.
- After automatic translation changes, repeat `ai_i18n_list_translations` with the same scope.
- After orphan deletion, repeat `ai_i18n_list_orphan_messages` after the same complete Build.
- After human review changes, repeat `ai_i18n_list_overrides` with the same scope.
