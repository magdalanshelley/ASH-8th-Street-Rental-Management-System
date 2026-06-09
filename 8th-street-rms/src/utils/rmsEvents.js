export const RMS_REFRESH_EVENT = 'rmsDataUpdated'

export function dispatchRmsRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RMS_REFRESH_EVENT))
  }
}
