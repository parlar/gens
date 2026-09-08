export abstract class ShadowBaseElement extends HTMLElement {
  protected root: ShadowRoot;

  /** Disconnect sets of listeners attached to element on disconnect */
  private abortController: AbortController | null = null;

  protected getListenerAbortSignal(): AbortSignal {
    if (this.abortController == null) {
      throw Error(
        "Must connect component (remember super.connectedCallback()) before adding listeners",
      );
    }
    return this.abortController.signal;
  }

  // Generic over the event name, so a "mousemove" handler is handed a
  // MouseEvent rather than an Event it has to cast. Flattening them all to
  // Event meant every handler that wanted the pointer position had to assert
  // its way back to the type the DOM already knew.
  protected addElementListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    callback: (event: HTMLElementEventMap[K]) => void,
  ) {
    element.addEventListener(type, callback, {
      signal: this.getListenerAbortSignal(),
    });
  }

  constructor(template: HTMLTemplateElement) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    if (!this.root) {
      this.root = this.attachShadow({ mode: "open" });
    }

    this.abortController = new AbortController();
  }

  disconnectedCallback() {
    // Null for an element disconnected before it was ever connected, which
    // happens when one is built and dropped without being attached.
    this.abortController?.abort();
  }
}
