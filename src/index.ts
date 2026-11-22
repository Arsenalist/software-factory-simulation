export interface MountOptions { hash?: boolean }
export function mount(el: HTMLElement, _options: MountOptions = {}): () => void {
  el.textContent = 'Software factory';
  return () => { el.textContent = ''; };
}
