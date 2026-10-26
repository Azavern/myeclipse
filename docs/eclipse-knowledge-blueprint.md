# Eclipse Knowledge — Product & Technical Blueprint

## 1. Overview

**Public route:** `/knowledge/`  
**Purpose:** A shared knowledge library where class members can publish useful information—shortcuts, URLs, references, tutorials, notes, guides, and other reusable knowledge. Publicly visible entries can be read by anyone on the internet.

### Product principles
1. **Open reading:** public knowledge is readable without signing in.
2. **Author-controlled editing:** the original author controls who may edit their entry.
3. **Controlled exception:** another member may request editing access. The author can approve or reject it. For urgent cases where the author has lost account access, the request can be escalated to the class leader.
4. **Visibility control:** the author and class leader can change an entry's visibility. The class leader can manage visibility but does not automatically gain permission to rewrite the content.
5. **Low persistence overhead:** do not keep a full revision archive. Store the current content and lightweight edit-highlight metadata only.
6. **Draft resilience:** preserve unsaved drafts locally on the user's device; do not send a database request on every keystroke.
7. **Readable, flexible content:** Markdown is the primary content format, with a live preview.

## 2. Routes and experiences

- `/knowledge/` — public Knowledge Explorer.
- `/knowledge/[slug]/` — individual knowledge entry.
- `/knowledge/create/` — create a new entry (authentication required).
- `/knowledge/[slug]/edit/` — edit an entry when authorized.
- `/knowledge/[slug]/request-edit/` — request edit permission.
- `/knowledge/manage/` — authenticated user's entries, drafts, and edit requests.
- `/knowledge/manage/requests/` — requests received by an author and requests awaiting class-leader intervention.
- Optional administrative view: `/knowledge/manage/moderation/` for class-leader visibility actions and escalated requests.

Use the existing app's route conventions if they differ. Do not invent a separate authentication system; integrate with the app's existing identity and class membership model.

## 3. Knowledge entry fields

### Required / author-editable
- **Main Title:** required, maximum 50 characters.
- **Tagline:** optional, maximum 150 characters.
- **Content:** required Markdown source.
- **Category:** optional; a single category per entry is sufficient for the initial version. Categories may be managed centrally or selected from available values.
- **Hashtags:** optional, multiple tags; normalize case and whitespace to avoid duplicates.

### System-managed
- Stable entry ID.
- Slug / canonical URL, generated from title and made unique. Title changes should not silently break existing links; use redirects or retain a stable slug.
- Author/member ID.
- Created timestamp.
- Updated timestamp.
- Publication status: Draft / Published / Archived.
- Visibility state.
- `edited` indicator and lightweight metadata identifying the latest edited/added content segments.
- Optional lightweight engagement counters only if genuinely needed; avoid writing a database row for every page view.

## 4. Visibility and public access

Public visibility is the default for newly published entries, unless the author explicitly selects another state.

Define these states clearly:
- **Public:** anyone on the internet can read it; eligible for search-engine indexing.
- **Unlisted:** readable by anyone with the link, but omitted from the normal explorer and requested not to be indexed. This is obscurity, not access control.
- **Class-only:** requires an authenticated member of the class.
- **Private / Draft:** only the author and authorized class leader can access it, subject to application policy.

The author can change visibility for their own entry. The class leader can also change visibility, for example to hide exposed personal information or respond to a moderation request. A class leader's visibility action must not grant content-edit permission automatically.

Visibility must be enforced on the server/database, not merely by hiding links in the UI. Public pages must not leak private content through search results, previews, metadata, API responses, sitemap entries, or cached pages. When visibility changes, invalidate relevant caches and update indexing behavior. For urgent privacy/safety cases, the class leader should be able to hide an entry immediately.

## 5. Permissions and edit-request workflow

### Roles
- **Visitor:** read Public entries; cannot create, edit, or request member-only actions.
- **Authenticated class member:** create and own entries; request edit access to entries owned by others.
- **Entry author:** edit own entry, manage its tags/category, approve or reject edit requests, and set visibility.
- **Class leader:** manage visibility for any entry; review escalated edit requests when the author is unavailable; may perform a narrowly scoped emergency takeover only after the request is reviewed and authorized.

### Request flow
1. A member chooses **Request edit access** on another member's entry.
2. They provide a short reason and optionally explain the proposed change.
3. The author receives an in-app notification and can approve or reject the request.
4. If approved, grant explicit, revocable edit permission for that entry. Define whether it is one-time or ongoing; default recommendation: ongoing until revoked, with the author able to revoke it.
5. If the author cannot be reached or has lost account access, the requester may **Escalate to class leader** and provide a reason.
6. The class leader reviews the request. If approved, grant temporary edit access or perform a controlled recovery action. The class leader must not silently impersonate the author.
7. Show request state: Pending author, Approved, Rejected, Escalated, Approved by leader, Expired, or Revoked.
8. Notify relevant parties of decisions and changes where notification facilities exist.

Keep a small audit trail for permission and visibility actions (actor, action, entry, timestamp, reason where relevant). This is not a content revision history and should remain lightweight.

### Important edge cases
- An author cannot approve their own request.
- Duplicate pending requests for the same entry/requester should be prevented or consolidated.
- Edit access must be checked on every server-side mutation, not only in the interface.
- Removing class membership must revoke permissions that depend on membership, according to the app's membership policy.
- If an author account is recovered, the author should regain normal ownership controls.
- Class-leader emergency access must be limited to the specific entry/request and should be revocable/expire where practical.

## 6. Editing and “Edited” content highlights — no full revision archive

### Intended user experience
- New entries display normally.
- Once an entry is edited and saved, show an **Edited** indicator near its updated timestamp.
- Highlight the newly added or changed portions of the currently displayed content with a consistent, accessible background color.
- Removed text cannot be highlighted in the new version because it no longer exists; do not show deleted text unless a separate change summary is intentionally added.
- The next edit recalculates the highlights against the immediately previous saved content. The product does not promise a permanent history of earlier edits.

### Recommended implementation concept
1. On save, the server obtains the previous saved Markdown and the submitted Markdown.
2. Compare them transiently using a diff algorithm.
3. Convert the result into compact annotations for added/modified spans or blocks in the new content.
4. Persist only the new Markdown, `edited`/`updated_at`, and the compact highlight annotations needed to render the current saved version.
5. Discard the temporary before/after comparison data after processing. Do not store full old content as a revision.
6. When rendering Markdown, apply highlights only to the corresponding safe text nodes/blocks; never interpret stored content as raw executable HTML.
7. If annotations become invalid due to later edits or Markdown parsing changes, regenerate them during the next save or safely fall back to showing the Edited label without highlights.

### Practical constraints
- Fine-grained character diffs can become fragile around Markdown syntax, links, code blocks, and reordered paragraphs. Prefer a block/line-aware diff first, with inline highlighting where safe.
- If a paragraph is rewritten heavily, highlight the changed paragraph/block instead of attempting a misleading character-perfect highlight.
- Added/changed content is highlighted; deleted content is not.
- Highlight annotations describe only the latest saved edit and are replaced on the next edit. This avoids keeping a revision archive.
- Consider a small **“Hide edit highlights”** reading control if highlights become visually distracting. It must not change the stored content.
- Ensure highlight colors work in both light and dark themes and maintain sufficient contrast.

## 7. Drafts and recovery without frequent database writes

### Recommended default
Use **local draft autosave** rather than database autosave:
- Save the editor's working state to browser storage after a short debounce (for example, 1–2 seconds after typing pauses).
- Save title, tagline, Markdown content, category, hashtags, entry ID/slug if editing, and the last local-save time.
- Restore a draft when the user returns to the same entry/editor on the same browser profile and device.
- Show a clear state: “Saved on this device”, “Unsaved changes”, “Draft restored”, or “Published”.
- Provide explicit **Save draft**, **Publish**, **Discard local draft**, and **Clear recovered draft** actions.
- Warn before leaving if there are changes that have not reached local storage yet.
- Never store access tokens, passwords, session cookies, or other secrets in local storage.

### Limits and privacy
- Browser storage is device/browser/profile-specific. It does not follow the user to another device, browser, or cleared profile.
- It can be cleared by the user/browser and may be unavailable in private browsing or under storage pressure. Treat it as recovery assistance, not guaranteed backup.
- When editing an existing entry, keep the local draft separate from the published server version until the user saves.
- If the user loses device access, the app cannot magically detect that loss or recover a local-only draft from another device. Do not claim otherwise.
- Optional future enhancement: explicit **Save draft to account** for cross-device recovery. This writes to the database only on explicit action or infrequent checkpoints, not on every keystroke.
- Avoid automatic server saves triggered by unreliable assumptions about device loss, browser shutdown, or network disconnect. Such events cannot be detected reliably enough to guarantee a final save.
- On sign-out, offer to keep or clear local drafts; do not silently delete them.

## 8. Knowledge Explorer: search, filtering, sorting

Support:
- Full-text search across title, tagline, content, category, and hashtags where practical.
- Hashtag filter with clickable tags.
- Optional category filter.
- Combined filters (search + category + multiple hashtags).
- Sorting: newest published, recently updated, title A–Z, title Z–A.
- Optional relevance sort when a search query exists.
- Clear all filters and useful empty states.
- Pagination or incremental loading for larger collections.
- A visible count of matching entries where practical.
- Copy-link and share actions on the entry page.

Do not implement “popular” sorting based on expensive writes on every view in the first release. It can be added later using aggregated or privacy-conscious metrics if there is a real product need.

## 9. Markdown editor and reader

### Editor
- Main Title and Tagline inputs with live character counts.
- Optional category selector.
- Hashtag input that supports multiple tags, suggestions, and removal.
- Markdown editing area.
- Live rendered preview beside the editor on desktop.
- Preview can be hidden/shown.
- Mobile layout uses Editor / Preview tabs or a clear stacked layout.
- Toolbar inserts Markdown syntax for headings, bold, italic, strikethrough, inline/block code, links, images, lists (including nested and task lists), quotes, tables, and horizontal rules; raw Markdown remains supported.
- Common keyboard shortcuts are available while the editor is focused (for example Ctrl/Cmd+B, I, E, K, Shift+X, Shift+7/8/9, Alt+1/2/3), and selecting text before pressing a toolbar button wraps that selection.
- Preview must match the published rendering.
- Sanitize rendered output and validate URL protocols; do not permit script execution or unsafe HTML.
- Warn before leaving with unsaved work.

### Reader
- Clear typography and comfortable line length.
- Title, tagline, category, hashtags, author, published date, updated date, and Edited indicator.
- Table of contents generated from headings for longer entries.
- Syntax-highlighted code blocks with copy button, if supported by the app's renderer.
- Clickable links with safe external-link behavior.
- Edit/request-edit actions shown only to eligible users.
- Responsive layout and accessible focus states.

## 10. Suggested page layout

### Explorer
1. Site header / breadcrumb.
2. “Eclipse Knowledge” title and short explanatory tagline.
3. Search field.
4. Category and hashtag filters.
5. Sort selector.
6. Optional featured/pinned knowledge area.
7. Knowledge cards/list showing title, tagline, category, hashtags, author, and updated date.
8. Empty state and pagination/load-more control.
9. “Contribute knowledge” CTA for signed-in users; sign-in prompt for visitors.

### Entry page
1. Breadcrumb back to Knowledge.
2. Title and tagline.
3. Author and dates, with Edited indicator if applicable.
4. Category and hashtag chips.
5. Content body with edit highlights where applicable.
6. Copy link / share / edit / request-edit actions based on permissions.
7. Related entries by shared tags, if useful and inexpensive.

### Create/edit page
1. Header with Create/Edit status.
2. Form fields.
3. Split Markdown editor and live preview.
4. Preview visibility toggle.
5. Visibility selector and category/tags.
6. Local-save status and recovery notice.
7. Save draft / Publish or Save changes controls.
8. Unsaved-changes warning.

## 11. Security, quality, and acceptance criteria

- Public pages can be opened without signing in.
- Class-only/private/draft entries are not exposed by direct URL, search, API, metadata, or cached responses.
- New published entries are Public by default, subject to the chosen default policy.
- Only an author or explicitly authorized editor can update content.
- The class leader can change visibility without automatically receiving content-edit permission.
- An edit request cannot grant access until approved by the appropriate authority.
- Emergency escalation is explicit and leaves a lightweight audit record.
- Saving an edit updates the current content and replaces the latest edit-highlight annotations; no full revision archive is retained.
- Markdown and embedded links are rendered safely.
- Local drafts survive refresh/browser restart on the same browser profile when browser storage remains available.
- The UI does not claim local drafts are backed up to the cloud.
- Search, tag/category filters, sorting, pagination, editor preview, and mobile layouts work.
- Loading, empty, error, permission-denied, offline, and conflict states have designed UI.
- If two authorized editors save concurrently, the app detects stale content and asks the later editor to reload/compare rather than silently overwriting someone else's changes.

## 12. Technical implementation notes (for coding agent)

Use the existing application stack and patterns. For the current project, that means Next.js and Supabase unless the repository's actual blueprint states otherwise.

Suggested logical data entities (adapt to existing schema instead of duplicating it):
- `knowledge_entries`: current content and metadata only.
- `knowledge_categories`: optional reusable categories.
- `knowledge_tags` and `knowledge_entry_tags`: normalized hashtag relations, if the current database pattern favors normalized tags.
- `knowledge_edit_requests`: request status, requester, entry, reason, decision actor, timestamps, and granted permission scope.
- `knowledge_editors` or an equivalent explicit permission relation for additional editors.
- A small audit table for visibility and permission changes; do not store full content snapshots there.

Keep the content body as Markdown source. Keep edit-highlight annotations as compact structured metadata associated with the current version. The exact representation should be chosen after inspecting the current app's schema and Markdown renderer; do not bake HTML spans into the Markdown source as the only representation.

Use server-side authorization and database row-level security consistently. Never expose service-role credentials to the browser. Public reads should return only entries whose visibility permits public access. Make sure search and related-entry queries apply the same visibility constraints.

Avoid adding a database write on each keystroke. Local draft persistence belongs in the browser; server writes happen on explicit save/publish, edit-request actions, and necessary permission/visibility actions.

## 13. Out of scope for first release

- Full revision-history browser.
- Permanent storage of old content snapshots.
- Real-time collaborative editing.
- Automatic cross-device draft synchronization unless explicitly added as a separate feature.
- Popularity rankings driven by a database write per page view.
- Complex approval workflow for ordinary publication.
- File uploads/attachments unless separately specified.

## 14. Open implementation decisions

The coding agent should inspect the existing project and report any conflicts before implementing:
- Existing user/member and class-leader role model.
- Whether public indexing is enabled and how private pages are excluded from sitemaps/cache.
- Whether categories are centrally managed or freely created.
- Whether extra editor permission is ongoing or time-limited (recommended: ongoing but revocable by author).
- Which Markdown parser/renderer is already used.
- Whether local draft storage should use localStorage or IndexedDB. Start with localStorage for modest content; consider IndexedDB only if draft sizes justify it.
