/** True when running on a preview host (e.g. a Claude artifact) that blocks outside connections, downloads and printing. */
export const PREVIEW_HOST = (import.meta.env.VITE_PREVIEW_HOST as string | undefined) || undefined
export const canDownload = !PREVIEW_HOST
