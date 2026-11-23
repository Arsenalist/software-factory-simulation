// Entry: `import { mount } from '/software-factory/software-factory.js'` and call mount(el).
import { h, render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

export interface MountOptions {
  /** Keep the factory's config in the URL hash (#v1=...). Default true. */
  hash?: boolean;
}

/** Mounts the simulator into `el`. Returns a function that removes it. */
export function mount(el: HTMLElement, options: MountOptions = {}): () => void {
  // The floor bleeds off the page edge. Measure how far the mount sits from the viewport's sides
  // (clientWidth, so a visible scrollbar never causes sideways scroll).
  const measure = () => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--sf-bleed-l', `${Math.max(0, r.left)}px`);
    el.style.setProperty('--sf-bleed-r', `${Math.max(0, document.documentElement.clientWidth - r.right)}px`);
  };
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(document.documentElement);
  ro.observe(el);
  render(h(App, { useHash: options.hash !== false }), el);
  return () => { ro.disconnect(); render(null, el); };
}
