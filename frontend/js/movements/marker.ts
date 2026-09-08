import { ShadowBaseElement } from "../components/util/shadowbaseelement";
import { COLORS, SIZES, STYLE, ZINDICES } from "../constants";
import { rangeSize, sortRange } from "../util/utils";
import { requireElement } from "../util/dom";
import {
  CLOSE_INSET_PX,
  CLOSE_SIZE_PX,
  closeButtonPlacement,
  closeButtonShowing,
} from "../util/marker_close_button";

const style = STYLE.menu;

const template = document.createElement("template");
template.innerHTML = String.raw`
  <style>
    :host {
      position: absolute;
      left: 0;
      top: 0;
      display: flex;
      pointer-events: none;
      z-index: ${ZINDICES.trackMarkers};
      background-color: ${COLORS.transparentYellow};
      box-sizing: border-box;
      border-left: ${SIZES.one}px solid ${COLORS.lightGray};
      border-right: ${SIZES.one}px solid ${COLORS.lightGray};
    }
    #close {
      display: none;
      position: absolute;
      top: ${CLOSE_INSET_PX}px;
      right: ${CLOSE_INSET_PX}px;

      width: ${CLOSE_SIZE_PX}px;
      height: ${CLOSE_SIZE_PX}px;
      background: rgba(0, 0, 0, 0.4);
      text-align: center;
      color: white;

      font-size: ${style.headerSize}px;
      line-height: ${CLOSE_SIZE_PX}px;
      cursor: pointer;
      pointer-events: auto;
    }
    :host(.has-close):hover #close {
      display: block;
    }
    #close:hover {
      color: ${style.textColor};
    }
  </style>
  <div id="close">x</div>
`;

export class GensMarker extends ShadowBaseElement {
  private close: HTMLDivElement;

  // This is to detect hover over the highlight while still allowing
  // clicking through on the underlying canvas
  // Better approaches to this are welcome
  private onMouseMove: (e: MouseEvent) => void;
  // A marker the reader cannot close is created without one.
  private closeCallback: ((id: string) => void) | null;
  private markerId: string;
  private height: number;
  private color: string;
  // Is it still being dragged out or has it been created
  private isCreated: boolean;

  constructor() {
    super(template);
  }

  initialize(
    markerId: string,
    height: number,
    settings: { color: string; isCreated: boolean },
    closeCallback: ((id: string) => void) | null,
  ) {
    this.markerId = markerId;
    this.height = height;
    this.color = settings.color;
    this.isCreated = settings.isCreated;
    this.closeCallback = closeCallback;
  }

  connectedCallback(): void {
    this.close = requireElement(this.root, "#close");

    // Normally it would be preferable to deal with the mouse hover though CSS only
    // Here is tricky though, as we want pointer: none to let it click elements below
    if (this.closeCallback != null) {
      this.onMouseMove = this.handleMouseMove.bind(this);
    }

    this.style.height = `${this.height}px`;
    this.style.width = "0px";
    this.style.backgroundColor = this.color;
    this.classList.toggle(
      "has-close",
      this.closeCallback != null && this.isCreated,
    );

    const closeCallback = this.closeCallback;
    if (closeCallback != null) {
      this.close.addEventListener("click", () => {
        closeCallback(this.markerId);
      });
    }

    document.addEventListener("mousemove", this.onMouseMove);
  }

  disconnectedCallback(): void {
    document.removeEventListener("mousemove", this.onMouseMove);
  }

  render(pxRange: Rng) {
    const sortedRange = sortRange(pxRange);
    const width = rangeSize(sortedRange);
    this.style.left = `${sortedRange[0]}px`;
    this.style.width = `${width}px`;
    this.style.height = `${this.height}px`;

    // A highlight around a single gene is a few pixels wide and cannot hold the
    // button, which then went off its left-hand side and read as belonging to
    // whichever track it floated over. Outside the right edge instead.
    const placement = closeButtonPlacement(width);
    this.close.style.left = placement.left;
    this.close.style.right = placement.right;
  }

  private handleMouseMove(e: MouseEvent) {
    // The button's own rectangle counts too. It is placed inside the
    // highlight's top right corner, which needs 32 px of highlight to fit in;
    // a highlight around a single gene is often narrower than that, and the
    // button then sits beside the highlight rather than on it. Testing the
    // highlight alone hid it as soon as the pointer arrived.
    const showing = closeButtonShowing(
      { x: e.clientX, y: e.clientY },
      this.getBoundingClientRect(),
      this.close.getBoundingClientRect(),
      this.isCreated,
    );
    this.close.style.display = showing ? "block" : "none";
  }
}

customElements.define("gens-marker", GensMarker);
