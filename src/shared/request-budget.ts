/** One bounded Backend request, including its response body. */
export const BACKEND_REQUEST_TIMEOUT_MS = 6_000
export const BACKEND_READ_RETRY_DELAY_MS = 300

/** An ordinary one-page Host read may make two Backend attempts. */
export const BACKEND_READ_BUDGET_MS = BACKEND_REQUEST_TIMEOUT_MS * 2 + BACKEND_READ_RETRY_DELAY_MS

/** Allow local transport/parsing overhead after that read; not a write-chain guarantee. */
export const BROWSER_REQUEST_TIMEOUT_MS = BACKEND_READ_BUDGET_MS + 3_000
