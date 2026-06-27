export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"

// API version. Bump when the backend introduces a breaking `/api/v2` surface.
export const API_VERSION = "v1"
export const API_PREFIX = `/api/${API_VERSION}`
