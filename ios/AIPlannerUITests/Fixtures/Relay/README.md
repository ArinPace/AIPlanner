# Live relay fixtures

These are authored disposable test files, not user documents. PDF, DOCX and XLSX contain valid format structures; ZIP contains `marker.txt`. The PNG displays its marker as pixels.

| File | Marker |
| --- | --- |
| verification.csv | CSV-8172 |
| verification.pdf | PDF-4613 |
| verification.docx | DOCX-7294 |
| verification.xlsx | XLSX-5386 |
| verification.png | IMAGE-6042 |
| verification.zip | ZIP-9327 |
| verification.txt | TEXT-2468 |

Install into an already installed debug simulator app with `python3 scripts/install-relay-test-fixtures.py <UDID>`. The installer only writes fixture JSON to that app's cache. Tests still use the normal Planner upload, ChatGPT website upload, response download and Planner storage paths.

File names and attachment badges alone are insufficient acceptance evidence. A live test must recover markers from actual file contents; returned files should also be downloaded from Planner storage and compared byte-for-byte with these originals. ChatGPT may add a numeric suffix to repeated upload names.
