# auth capability

## Purpose

Identifies users and issues short-lived tokens for the API. Hardened against the most common production attacks (credential stuffing, token theft, replay) at the foundation level, so later capabilities can assume an authenticated `tenantId + userId + permissions[]` context.

## Requirements

### Requirement: Passwords are hashed with Argon2id

The system SHALL hash all stored passwords with Argon2id. Other algorithms (bcrypt, SHA, plaintext) SHALL NOT be accepted.

#### Scenario: A new user is created with a valid password

- GIVEN `POST /api/v1/users` with `password: "Str0ng!Password_2026"`
- WHEN the user is persisted
- THEN `passwordHash` starts with `$argon2id$`

### Requirement: Password complexity is enforced server-side

The system SHALL reject passwords shorter than 12 characters or missing at least one each of lowercase, uppercase, digit, symbol.

#### Scenario: Weak password is rejected

- GIVEN `POST /api/v1/users` with `password: "short"`
- WHEN the request is processed
- THEN the response is 400 with an RFC 7807 problem document and detail `"password does not meet complexity"`

### Requirement: Login issues a 15-min access token and a 7-day refresh token

The system SHALL respond to `POST /api/v1/auth/login` with a JWT access token (TTL 15 min) and an opaque refresh token (TTL 7 days). The refresh token's hash SHALL be stored in `refresh_tokens` for revocation.

#### Scenario: Successful login

- GIVEN a valid email + password
- WHEN `POST /api/v1/auth/login`
- THEN the response contains `accessToken` (JWT) and `refreshToken`
- AND a row in `refresh_tokens` exists with `tokenHash = sha256(refreshToken)` and `expiresAt = now + 7d`

### Requirement: Refresh tokens rotate on every use

The system SHALL invalidate the presented refresh token and issue a new pair on every `POST /api/v1/auth/refresh`.

#### Scenario: Refresh token is rotated

- GIVEN a valid refresh token R1
- WHEN `POST /api/v1/auth/refresh` with R1
- THEN the response contains new tokens
- AND R1's row in `refresh_tokens` has `revokedAt != null`

### Requirement: Login is locked out after repeated failures

The system SHALL lock an account for 15 minutes after 5 failed login attempts within the lockout window. Lockout state SHALL be tracked in Redis (or the in-memory fallback) keyed by normalised email.

#### Scenario: 6th attempt is rejected even with correct password

- GIVEN a user has 5 failed login attempts in the last 15 minutes
- WHEN they POST `/api/v1/auth/login` with the correct password
- THEN the response is 401 with detail `"account temporarily locked"`

### Requirement: Logout revokes the presented refresh token

The system SHALL mark the supplied refresh token as revoked on `POST /api/v1/auth/logout`.

#### Scenario: Logged-out token can't be reused

- GIVEN a refresh token R
- WHEN `POST /api/v1/auth/logout` with R
- AND `POST /api/v1/auth/refresh` with R
- THEN the refresh call returns 401

### Requirement: Errors follow RFC 7807

The system SHALL return error responses with `Content-Type: application/problem+json` and the fields `type`, `title`, `status`, `detail`, `instance`, `requestId`.

#### Scenario: Wrong password returns problem+json

- GIVEN an existing user
- WHEN `POST /api/v1/auth/login` with the wrong password
- THEN the response status is 401
- AND `Content-Type` is `application/problem+json`
- AND the body contains `requestId`
