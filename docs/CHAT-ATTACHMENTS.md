# Agent chat attachments

The composer has **Add files** (paperclip), drag/drop and clipboard image/file paste. Users preview/remove attachments before sending; image thumbnails and file cards remain with the sent message. Selecting files does not send them. Attachment-only messages are supported.

Supported: PNG, JPEG, WebP, PDF and common plain text/code/CSV/JSON/Markdown files. Up to four attachments share a 2 MB binary limit, including generated PDF page previews. Unsupported formats, empty/oversized files, incorrect MIME signatures and duplicate IDs are rejected with visible errors.

Images are passed as actual image inputs. PDF text is extracted from up to 20 pages (50,000 characters) and images from up to four pages are supplied; coverage is included with the agent input. Text is capped at 50,000 characters per file. Unread pages, diagrams outside those page previews and truncation are not represented as complete coverage. Both Codex and Claude adapters support the content format; provider-specific model capabilities still apply.

Original bytes are private in `planner_vm_jobs.attachment_payload`, separate from public response metadata. The authenticated user can download their own sent attachments. Worker claims return payload only for the paired user's job. Normal polling returns names, types, sizes, coverage and small validated thumbnails, not full file payloads. Attachments follow the chat's existing Bin/purge lifecycle; they are not automatically added to Planner Files.

Every attachment is user-provided untrusted data. No attachment is executed, and no filesystem path or URL supplied in a filename is used as a host path or network destination.
