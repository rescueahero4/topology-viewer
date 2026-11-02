// A listener on the document sees the Shadow DOM host as `event.target`. The first item of the
// composed path is the real element.
export const targetOf = (event: Event): EventTarget | null =>
  event.composedPath()[0] ?? event.target;

let scope: (event: KeyboardEvent) => boolean = () => true;

// A viewer on a page sets this, so that its shortcuts do not take the keys of the page.
export function setKeyScope(next: (event: KeyboardEvent) => boolean): void {
  scope = next;
}

export const inKeyScope = (event: KeyboardEvent): boolean => scope(event);
