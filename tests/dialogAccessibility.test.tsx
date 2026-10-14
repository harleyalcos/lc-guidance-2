// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialogAccessibility } from '../src/hooks/useDialogAccessibility';

let root: Root;
let host: HTMLDivElement;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function Demo({ autofocus = false }) {
  useDialogAccessibility();
  const [open, setOpen] = useState(false);
  return <><button id="open" onClick={() => setOpen(true)}>Open</button>
    <label>Case description</label><input id="description" />
    {open && createPortal(<div role="dialog" aria-modal="true" tabIndex={-1}>
      <h2>Confirm restore</h2>
      <button id="cancel" onClick={() => setOpen(false)}><span className="material-symbols-outlined">close</span>Cancel</button>
      <input aria-label="Example input" autoFocus={autofocus} />
      <button id="confirm">Confirm</button>
    </div>, document.body)}
  </>;
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Virtual DOM has no layout; supply rectangles to exercise visibility/focus logic.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); await flush(); }); host.remove(); vi.restoreAllMocks(); });
async function open(autofocus = false) {
  await act(async () => { root.render(<Demo autofocus={autofocus} />); await flush(); });
  const trigger = document.getElementById('open')!;
  await act(async () => { trigger.click(); await flush(); });
  return trigger;
}
describe('dialog keyboard workflow', () => {
  it('contains Tab, cancels with Escape and restores the trigger after a mouse click', async () => {
    const trigger = await open();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')!.id);
    expect(host.inert).toBe(true);
    expect(document.activeElement?.id).toBe('cancel');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement?.id).toBe('confirm');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement?.id).toBe('cancel');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await flush(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
  it('does not remember a newly mounted autofocus field as the return target', async () => {
    const trigger = await open(true);
    await act(async () => { document.getElementById('cancel')!.click(); await flush(); });
    expect(document.activeElement).toBe(trigger);
  });
  it('connects a visual label to its input', async () => {
    await act(async () => { root.render(<Demo />); await flush(); });
    expect(host.querySelector('label')!.htmlFor).toBe('description');
  });
});
