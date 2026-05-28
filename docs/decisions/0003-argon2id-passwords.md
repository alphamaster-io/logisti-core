# ADR-0003: Argon2id for password hashing

**Status:** Accepted
**Date:** 2026-05-28

## Context
Legacy ExSpeed stored passwords in plaintext. Greenfield cannot. We need a modern, memory-hard, side-channel-resistant hash with tunable cost.

## Decision
Use **Argon2id** via the `argon2` npm package. Default parameters from the library, tunable via env (`ARGON2_MEMORY_COST`, etc.) when we need to.

## Rationale
- **PHC winner.** Argon2 is the password-hashing standard since 2015. Argon2id is the recommended variant (resists both side-channel and GPU attacks).
- **Memory-hard.** Tuning memory cost makes GPU brute force expensive.
- **First-class TS bindings.** The `argon2` package wraps the reference C implementation.

## Alternatives considered
- **bcrypt:** Still secure but capped at 72-byte input, not memory-hard, and was specifically called out as second-tier in OWASP's 2024 storage cheatsheet.
- **scrypt:** Memory-hard but Argon2 is newer with better params guidance.
- **PBKDF2:** Compatible but offers the weakest defence per CPU cycle.

## Consequences
- Slightly more native build complexity (argon2 builds a C addon during install).
- We can't roll back to plaintext-aware fallback — there's no path back from Argon2id, which is the whole point.
- Cost params can be raised over time; existing hashes need rehash-on-login.
