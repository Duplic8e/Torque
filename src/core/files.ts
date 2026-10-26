export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Opens the iOS share sheet (Save to Files, iCloud Drive) and falls back to a download link. */
export async function shareOrDownload(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Any other failure: fall through to the download link.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
