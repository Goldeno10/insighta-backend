# HNG14 Internship - Backend Track (Stage 0 to 3) 🚀

This repository contains the graduation of tasks from Stage 0 to Stage 3 of the HNG14 Backend Internship. It features a high-performance Demographic Intelligence API equipped with advanced query engines and strict role-based access control [TRD].

---

## 📂 Project Structure

- **`/hng-stage-0`** – The core Next.js application containing all API stages.
  - `GET /api/classify` – **Stage 0** – Name Classification.
  - `/api/profiles` – **Stage 1, 2 & 3** – Data Persistence & Advanced Query Engine [TRD].
  - `/api/profiles/search` – **Stage 2 & 3** – Natural Language Query Engine [TRD].
  - `/api/auth` – **Stage 3** – GitHub OAuth (PKCE) & Session Management [TRD].

---

## 🏗️ System Architecture

The Insighta Labs+ platform is engineered as a secure, distributed ecosystem composed of three isolated environments serving the same central intelligence datastore [TRD].

- **The Core API (Backend)** – A centralized Next.js RESTful engine connected to a managed Neon serverless PostgreSQL instance [TRD]. It strictly enforces security parameters at the edge [TRD].
- **The Web Portal** – A highly secure client portal utilizing server-side rendering. It never exposes JWT tokens to the browser, sealing session states inside strictly flagged HTTP‑Only cookies [TRD].
- **The CLI Tool** – A cross‑platform terminal management binary. It uses active loopback listening on local port `4800` to automate the PKCE token extraction sequence [TRD].

---

## 🔐 Authentication & Security Flow

### OAuth 2.0 with PKCE (Proof Key for Code Exchange)

The platform strictly enforces PKCE validation mapping for CLI authorization commands to prevent authorization code interception attacks [TRD]:

1. The client generates a random `code_verifier` and computes a `code_challenge` [TRD].
2. The user initiates a redirect to `/api/auth/github` carrying the computed `code_challenge` [TRD].
3. GitHub authorizes the profile and redirects the active session code back to the client [TRD].
4. The client executes a background call to `/api/auth/token` mapping the obtained code alongside its hidden original `code_verifier` to gain state access [TRD].

### Token Handling Approach

- **Access Tokens** – Signed with a strict short‑lived execution expiry of **3 minutes** [TRD].
- **Refresh Tokens** – Signed with an execution expiry of **5 minutes** [TRD].
- **Immediate Invalidation** – Every execution run pointed at the `/api/auth/refresh` endpoint blacklists the utilized refresh token in an Upstash Redis cache immediately to prevent replay vectors [TRD].

---

## 🚦 Role Enforcement Logic (RBAC)

Edge middleware inspects the incoming payload parameters on every protected path to enforce user roles extracted from mapped JWT claims [TRD]:

- **`analyst`** – Grants passive clearance. Restricted strictly to read execution flows via `GET` vectors [TRD].
- **`admin`** – Full tier clearance. Grants elevated execution rights to delete profile mappings or append new arrays (`POST`, `DELETE`) [TRD].

---

## 📖 API Documentation

### 1. Advanced Query Engine (Stage 2 & 3)

`GET /api/profiles`

Supports multi‑parameter filtering, sorting, and updated pagination shape [TRD].

- **Filters**: `gender`, `age_group`, `country_id`, `min_age`, `max_age`, `min_gender_probability`, `min_country_probability`.
- **Sorting**: `sort_by` (`age`, `created_at`, `gender_probability`) | `order` (`asc`, `desc`).
- **Required Headers**: `X-API-Version: 1` [TRD], `Authorization: Bearer <token>`.

### 2. Natural Language Search (Stage 2 & 3 Core)

`GET /api/profiles/search?q={query}`

### 3. Profile Export (Stage 3)

`GET /api/profiles/export?format=csv`

Streams full or filtered datasets straight into an attached document file buffer.

---

## 🧠 Intelligence Query Engine (NLP)

### Approach

The search endpoint uses a **Rule‑Based Tokenization** approach [TRD]. It parses the natural language string using optimized Regular Expressions (Regex) to map plain English keywords into structured database filters [TRD].

### Supported Keywords & Mappings

- `male` / `female` → `gender`
- `young` → Maps to age range `16 - 24` [TRD]
- `above {X}` / `older than {X}` → `min_age = X`
- `adult` / `teenager` etc. → `age_group`
- `from {country_name}` → `country_id` (e.g., `Nigeria` → `NG`)

### Limitations

- **Boolean Logic** – Does not currently support complex "OR" logic [TRD].
- **Synonyms** – Only supports exact keyword matches [TRD].
- **Language** – Currently optimized for English queries only [TRD].

---

## ⚙️ Features

- **Data Seeding** – Pre‑seeded with **2,026** unique intelligence profiles [TRD].
- **Rate Limiting** – Sliding window limiter tracking up to **60 requests per minute** [TRD].
- **CORS Enabled** – `Access-Control-Allow-Origin: *` for grading compatibility [TRD].

---

## 💻 Local Setup

1. **Clone the repo**:
   ```bash
   git clone https://github.com/Goldeno10/HNG14_Internship.git
   cd hng-stage-0
   ```

2. **Environment Variables** – Create a `.env.local` file with database connection strings and your GitHub OAuth credentials.

3. **Run Server**:
   ```bash
   npm run dev
   ```

---

## 👤 Author

- **GitHub**: [@Goldeno10](https://github.com/Goldeno10)
