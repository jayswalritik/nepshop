# Claude Code — Standing Rules (NepShop)

Every prompt in this repo applies these rules. A prompt that says
"Follow docs/claude-code-rules.md" means all of the below is in force.
Prompt-specific instructions override this file only where they say so explicitly.

---

## 1. Environment

- Windows, VS Code terminal, repo root `D:\NepShop`.
- Monorepo: `backend/` (Node/Express, CommonJS) + `frontend/` (React/Vite) + `mobile/` (Expo/React Native).
- Search with `findstr`, never `grep`.
- `findstr /s` needs a file mask (`backend\routes\*.js`). A bare directory silently returns nothing.
- `findstr /n "two or more words"` treats spaces as OR and floods the output.
  For a literal phrase always use `findstr /n /C:"exact phrase" <file>`.
  Single-word searches are fine.
- `findstr` mangles unicode in its output (`ΓÇö` for an em dash). That is a display artefact, never a code problem.

## 2. Git — do not run it

- The ONLY git command permitted is `git branch --show-current`, as the first step.
- If the branch is not the one named in the prompt, STOP and report the branch name.
- Never run add, commit, checkout, merge, pull, push, diff, stash, or reset.
- Ritik runs all git himself. If you emit a "commit this" chip, it will be ignored.

## 3. Dependencies

- Never run `npm install`. Never add a package to any `package.json`.
- If you believe a dependency is required, STOP and ask.
- Creating a new **source file** is not a dependency and is allowed when the prompt names it.

## 4. Diagnose before you edit

- Every task begins read-only: open the files, report their current content and line numbers.
- If what you find does not match the prompt's description, STOP and report the mismatch.
  Do not silently adapt, and do not "fix it while you're in there".
- If two instructions in the prompt contradict each other, STOP and ask.

## 5. Scope

- Prompts list WRITABLE FILES and OUT OF SCOPE files. Both are exhaustive.
- Touch nothing outside the writable list — no formatting, no lint fixes, no import reordering, no comment tidying.

**Permanently out of scope unless a prompt explicitly names the file as writable:**

- `frontend/src/pages/customer/OrdersPage.jsx`
- `mobile/src/utils/api.js`
- `backend/utils/orderPricing.js`
- `backend/utils/orderAggregate.js`
- `backend/utils/shipmentCancellation.js`
- `backend/config/settlementConfig.js`

## 6. Money model — inviolable

- All money logic lives in `backend/`. Read from a field or call an existing util. If neither exists, STOP.
- Never write money arithmetic in chatbot code, mobile code, or any frontend component.
- Never re-implement a calculation that already exists in a util. If you find a duplicate, report it — do not "unify" it unprompted.
- Reference model: Rs 1000 product → customer pays 1100; seller gets 950; agent Rs 50; NepShop Rs 100.
  Commission is on SUBTOTAL, not total, default 5%.
  Delivery is Rs 100 per seller-package, free when that package's subtotal is 2000 or more.
  Coupons are platform-funded and never touch subtotal, commission, seller share, or agent share.
- Comparing an already-computed field for display (`deliveryCharge === 0` → show "FREE") is display parity, not calculation, and is allowed.

## 7. Frontend and mobile

- `frontend/` is the read-only parity contract that `mobile/` mirrors. Do not change frontend behaviour to make a mobile task easier.
- Mobile hidden routes use `useFocusEffect`, never a mount-only `useEffect`.
- The wordmark is never uppercased — "Shop" stays in `accentLight`.
- Never modify `mobile/src/utils/api.js` for any reason.

## 8. Tests

- Extend existing suites. Never replace, rewrite, or delete an existing test.
- If an existing assertion fails because wording legitimately changed, do NOT delete it — report it and let Ritik decide.
- No DB connection in any test. Tests run with plain `node <path>` and no Atlas.
- New suites go in `backend/tests/` and follow the existing file's style.

## 9. Reporting

Keep the report to **10 lines or fewer**, plus the verification block. Cover only:

- what changed, per file, with line numbers
- anything you were told to check and what you found
- anything you could not do, or that contradicted the prompt
- test counts before and after

Do not restate the prompt, do not re-explain the task, do not summarise code you did not change.

**Honesty rules — these matter more than the report being tidy:**

- Never call something "unused", "dead", or "now unused" without showing the search that proves no call site exists, and stating whether the condition pre-existed this task.
- If your own output has a case that is still wrong, say so as a FAILURE at the top of the report, not as a neutral line in a behaviour table.
- Never claim a UI outcome. You cannot run the app. Parse-checks and tests only.

## 10. Verification block

End every report with a `MANUAL VERIFICATION` section:

- Exact `findstr` commands, Windows syntax, `/C:` quoted for every multi-word phrase.
- **One single code block**, one command per line, so it can be pasted once.
- Include a check for anything you deleted or renamed, proving zero occurrences remain.
- Include the `node backend\tests\<suite>.js` lines for every suite you touched.
- State which commands are expected to print nothing.