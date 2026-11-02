# E.C.H.O.

Electronic Cultured Home Operator is a local-first records and intelligence workstation built with vanilla HTML, CSS, JavaScript, and IndexedDB. Its interface is styled as an isolated institutional archive for tracking case files, artifacts, people, sites, events, and connections.

## Features

- Persistent local database with IndexedDB
- Case workspaces with linked people, evidence, events, and locations
- Evidence attachments with previews and SHA-256 integrity verification
- Timeline event comparisons with analyst-authored corroboration and contradiction links
- Intelligence graph with targeted archive-record attachment, sync, search/type filters, inspectable connections, and draggable saved node positions
- Searchable, editable field notes with tags and unsaved-draft protection
- Operator console with quoted search, record inspection, storage/integrity diagnostics, activity and attachment listings, theme/navigation/backup/report controls, history, completion, quick commands, and transcript export
- Print-ready archive reports and browser/system diagnostics snapshots
- Backup export, full restore, and non-overwriting merge with attachment data
- E.C.H.O. login, local-only storage, and responsive archive interface

## Launching the application

1. Open a terminal in this project folder.
2. Start the app:
   ```sh
   npm start
   ```
3. Visit http://127.0.0.1:8000 and enter the operator password on the E.C.H.O. login screen.

The password is verified by the local Node server; the source contains only a salted scrypt verifier, not the plaintext password. The server binds to localhost, limits failed login attempts, and protects app files behind an HTTP-only session cookie. Do not use this lightweight local login as a replacement for a hardened multi-user authentication system or encryption at rest.

## Project structure

- index.html
- login.html
- server.js
- css/main.css
- css/login.css
- js/app.js
- js/login.js
- js/database.js
- js/state.js
- js/utilities.js
- js/components/
- js/modules/

## Notes

E.C.H.O. stores records locally in the browser without external services. The existing browser database name is retained for compatibility with previously saved records. Locking the app gates HTTP access but does not encrypt IndexedDB data against someone with access to the same browser profile or device.

## Limitations

- Contradictions and corroborations are analyst-entered links; the app does not infer factual conflicts automatically.
- The intelligence graph uses a deterministic local layout rather than a force-directed graph engine.
- SHA-256 checks detect attachment changes relative to the stored digest but are not a tamper-proof chain of custody.
- IndexedDB is not encrypted at rest; protect the operating-system account and browser profile.
