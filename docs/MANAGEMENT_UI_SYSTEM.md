# Management UI System

Date: 30 September 2026

This document freezes the visual language of the management workbench so new
features do not gradually create separate UI dialects.

## 1. Page families

The management area has three deliberate density modes.

### A. Program workbench
- Full-width working canvas.
- Dense schedule grid is intentional.
- Compact controls are acceptable because the grid itself is the task.
- Do not force Program into the centered content-card layout.

### B. Configuration / inventory pages
Applies to:
- Ders Planı
- Kaynaklar
- Öncelikler

Rules:
- centered content
- default content width: 1220px
- Solver may use a wider 1460px shell because of its persistent saved-settings sidebar
- white cards on warm neutral background
- section title, explanation, filters/actions, content

### C. Status / review pages
Applies to:
- Program Durumu
- publication gate / publication comparison

Rules:
- centered content width: 1220px
- hierarchy over density
- summary first, detail second
- avoid multiple adjacent explanation cards that repeat the same point

## 2. Typography floor

Do not introduce new 8px or 9px body/meta text in management screens.

Recommended:
- Page title: 20–24px, font-black/bold
- Section title: 16–18px, bold
- Card title / row title: 12–14px, bold/black
- Body / helper: 11–12px
- Compact metadata / badges / table labels: minimum 10px
- Uppercase kicker: 10–11px, tracking 0.12–0.16em

Exception:
The Program grid may use compact 9–10px labels where the timetable density
requires it, but controls around the grid should remain readable.

## 3. Surfaces

Primary content cards:
- white background
- slate-200 border
- 22–24px radius
- subtle shadow-sm
- 16–20px internal padding

Rows / nested items:
- prefer border separators or slate-50 backgrounds
- avoid creating a new floating card for every explanatory paragraph

## 4. Spacing rhythm

Prefer:
- 4px for micro gaps
- 8px
- 12px
- 16px
- 20px
- 24px

Avoid arbitrary spacing unless required by grid geometry.

## 5. Actions

Primary action:
- dark slate or Partisyon red when it represents a meaningful commit/apply action
- clear verb

Secondary action:
- white background + slate border

Destructive:
- rose/red semantics only

Disabled:
- visible but subdued
- cursor-not-allowed
- never rely on color alone for meaning

## 6. Global history

Geri Al / Yinele belong to the management workbench, not an individual tab.

They live in the global top bar and remain in the same location on:
- Program
- Ders Planı
- Kaynaklar
- Öncelikler
- Program Durumu

The buttons represent the current management command history. They must not
pretend that a resource edit is undoable unless that resource mutation has been
written into the history engine.

## 7. Status colors

- emerald: success / ready / active
- amber: warning / attention / pending
- rose: blocker / error / destructive
- blue: informational / comparison / non-destructive system information
- slate: neutral / inactive / metadata

Do not invent alternate color meanings per page.

## 8. Content language

Prefer user-facing Turkish.

Avoid exposing backend terms such as:
- baseline
- snapshot
- candidate domain
- provisional
- solver
- transaction

unless the screen is explicitly diagnostic/developer-facing.

## 9. Progress feedback

Any action that may take more than a perceptible instant must show feedback
before heavy synchronous work or network work begins.

Pattern:
- button switches to progress verb
- visible inline status message
- duplicate clicks disabled
- success/error replaces progress state

## 10. Current normalization checkpoint

Normalized:
- global history controls
- Öncelikler
- Kaynaklar typography/content width
- Ders Planı typography
- Program Durumu typography/content width
- publication safety + comparison typography
- Program Durumu explanation cards consolidated

Still intentionally different:
- Program timetable remains full-width and dense
- Solver keeps wider 1460px shell because of saved-settings sidebar
