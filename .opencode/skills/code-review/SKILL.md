---
name: code-review
description: >
  Code review focused on over-engineering, test value, and concise docs. Finds what to delete:
  reinvented standard library, unneeded dependencies, speculative abstractions,
  dead flexibility. Use when the user says "review for over-engineering", "what can we
  delete", "is this over-engineered", "simplify review", or invokes
  /code-review. Complements correctness-focused review by hunting complexity,
  low-value tests, and unnecessary or unclear docs.
---

Review diffs for unnecessary complexity. One line per finding: location, what
to cut, what replaces it. The diff's best outcome is getting shorter.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

❌ "This EmailValidator class might be more complex than necessary, have you
considered whether all these validation rules are needed at this stage?"

✅ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✅ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✅ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✅ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Tests

- Never test third-party code, such as Zod's parsing behavior. Assume third-party systems work as documented; test our own rules and behavior.
- Flag string or constant presence checks. Replace them with meaningful behavior checks, or delete them if they only confirm that text or a constant exists.

## Docs

- When docs change, check that they are correct, short, and easy for an agent to use. Flag incorrect claims, unnecessary detail, or unclear instructions.
- For factory schema changes, check whether automatic schema generation covers the update. Require a docs page edit only when it is necessary and generation does not cover it.

## Boundaries

Scope: over-engineering, test value, and changed docs. Code correctness bugs, security holes,
and performance are explicitly out of scope. Route them to a normal review
pass, not this one. A single smoke test or `assert`-based
self-check is the ponytail minimum, not bloat, never flag it for deletion.
Does not apply the fixes, only lists them.
