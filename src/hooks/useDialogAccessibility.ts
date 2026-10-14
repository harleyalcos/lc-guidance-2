import { useEffect } from "react";

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';
const visible = (node: HTMLElement) => !!node.getClientRects().length && !node.closest('[hidden], [inert]');
export function useDialogAccessibility() {
  useEffect(() => {
    const opened = new Map<HTMLElement, HTMLElement | null>();
    let lastControl: HTMLElement | null = null;
    const rememberControl = (event: Event) => {
      if (event.target instanceof Element) {
        lastControl = event.target.closest<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]');
        // WebKit does not focus mouse-clicked buttons by default. Focus the trigger
        // before React opens its dialog so closing can return to that same control.
        if (event.type === 'click' && lastControl?.matches('button,a[href],[role="button"]')) {
          lastControl.focus({ preventScroll: true });
        }
      }
    };
    const inerted = new Map<HTMLElement, boolean>();
    const dialogs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(d => !!d.getClientRects().length);
    const reconcile = () => {
      // Connect visual labels to the actual nested input control.
      document.querySelectorAll<HTMLLabelElement>('label:not([for])').forEach(label => {
        const control = label.querySelector<HTMLElement>('input, select, textarea') || label.nextElementSibling?.matches('input,select,textarea') && label.nextElementSibling as HTMLElement || label.nextElementSibling?.querySelector<HTMLElement>('input,select,textarea');
        if (control && !label.contains(control)) {
          control.id ||= `field-${crypto.randomUUID()}`;
          label.htmlFor = control.id;
        }
      });
      const active = dialogs();
      for (const [element, original] of inerted) element.inert = original;
      inerted.clear();
      for (const [dialog, previous] of opened) {
        if (!active.includes(dialog)) {
          opened.delete(dialog);
          if (previous?.isConnected) previous.focus();
        }
      }

      const top = active[active.length - 1];
      if (!top) return;
      const heading = top.querySelector<HTMLElement>('h1,h2,h3,h4');
      if (!top.hasAttribute('aria-label') && !top.hasAttribute('aria-labelledby') && heading) {
        heading.id ||= `dialog-title-${crypto.randomUUID()}`;
        top.setAttribute('aria-labelledby',heading.id);
      }
      const isNew = !opened.has(top);
      if (isNew) {
        const focused = document.activeElement;
        opened.set(top, focused instanceof HTMLElement && focused.matches(focusableSelector) && !top.contains(focused)
          ? focused : lastControl);
      }
      let current: HTMLElement = top;
      while (current.parentElement && current.parentElement !== document.documentElement) {
        for (const sibling of current.parentElement.children) {
          if (sibling !== current && sibling instanceof HTMLElement && !sibling.contains(top)) {
            inerted.set(sibling,sibling.inert); sibling.inert = true;
          }
        }
        current = current.parentElement;
      }
      if (isNew) {
        const first = Array.from(top.querySelectorAll<HTMLElement>(focusableSelector)).find(visible);
        (first || top).focus();
      }
    };
    const keydown = (event: KeyboardEvent) => {
      const active = dialogs();
      const top = active[active.length - 1];
      if (!top) return;
      if (event.key === 'Tab') {
        const fields = Array.from(top.querySelectorAll<HTMLElement>(focusableSelector)).filter(visible);
        const first = fields[0], last = fields[fields.length - 1];
        if (!first) { event.preventDefault(); top.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      } else if (event.key === 'Escape') {
        const close = Array.from(top.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).find(button => {
          const copy = button.cloneNode(true) as HTMLButtonElement;
          copy.querySelectorAll('.material-symbols-outlined').forEach(icon => icon.remove());
          const label = button.getAttribute('aria-label') || copy.textContent?.trim() || '';
          return /^(close|cancel|continue editing|keep editing)(?:\s|$)/i.test(label);
        });
        if (close) { event.preventDefault(); event.stopPropagation(); close.click(); }
      }
    };
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('keydown',keydown,true);
    document.addEventListener('pointerdown',rememberControl,true);
    document.addEventListener('click',rememberControl,true);
    reconcile();
    return () => {
      observer.disconnect(); document.removeEventListener('keydown',keydown,true);
      document.removeEventListener('pointerdown',rememberControl,true);
      document.removeEventListener('click',rememberControl,true);
      for (const [element, original] of inerted) element.inert = original;
    };
  },[]);
}
