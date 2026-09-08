import { SIZES } from "../../constants";
import { ShadowBaseElement } from "../util/shadowbaseelement";

const template = document.createElement("template");
template.innerHTML = String.raw`
  <style>
    #help-container {
      display: flex;
      flex-direction: column;
      gap: ${SIZES.s}px;
      line-height: 1.5;
    }
    h3 {
      margin: 0;
    }
    p {
      margin: 0;
    }
    b {
      font-weight: bold;
    }
  </style>
  <div id="help-container">
    <h3>Mouse navigation</h3>
    <ul>
        <li><b>Drag</b> the tracks to move along the chromosome</li>
        <li>Navigate to a chromosome by <b>click</b> in the overview chart (bottom)</li>
        <li>Zoom in by <b>Shift+click</b></li>
        <li>Zoom out by <b>Ctrl+click</b></li>
        <li>Zoom in on a region by <b>Shift</b> and <b>dragging</b> with the mouse</li>
        <li><b>Click</b> chromosome bands in the ideogram chart to jump to that region</li>
        <li>Right click tracks to toggle tracks expanded / collapsed</li>
        <li>When in marker mode (toggle using the pen icon in the top bar), drag to place highlights. You can navigate directly to these later from the settings menu.</li>
        <li>A dashed line follows the pointer across every track, with the base position beside it, so the same coordinate can be read on all of them at once</li>
    </ul>
    <h3>Marking boundaries</h3>
    <p>To compare the edges of an event against the other tracks, put the pointer on an edge and press <b>V</b>. The line stays where it was left, through panning and zooming, so the tracks can be read against it without holding the pointer still. Pin the other edge as well and the distance between the two is shown between them, which for a coverage drop is the size of the event.</p>
    <ul>
        <li>Press <b>V</b> again on a line to take it away</li>
        <li>Press <b>Shift+V</b> to take away all of them</li>
    </ul>
    <h3>Keyboard shortcuts</h3>
    <ul>
        <li>Use <b>left</b> and <b>right</b> arrow keys to move within a chromosome</li>
        <li>Use <b>up</b> and <b>down</b> keys to zoom in and out</li>
        <li>Use <b>Ctrl + left</b> and <b>right</b> arrow keys to change chromosome</li>
        <li>Press <b>Escape</b> to close the context menu</li>
        <li>Press <b>R</b> to reset the zoom</li>
        <li>Press <b>M</b> to toggle marker mode</li>
        <li>Press <b>V</b> to pin a line where the pointer is, or remove the one already there</li>
        <li>Press <b>Shift+V</b> to remove every pinned line</li>
    </ul>
    <h3>Search</h3>
    <p>To search, type your query into the search box. If multiple entries matches, Gens will navigate to the first. Available queries are:</p>
    <ul>
        <li><b>chromosome:start-stop</b></li>
        <li><b>chromosome</b></li>
        <li><b>gene name</b></li>
        <li><b>matches within any annotation band</b></li>
    </ul>
  </div>
`;

export class HelpMenu extends ShadowBaseElement {
  constructor() {
    super(template);
  }

  render() {}
}

customElements.define("help-page", HelpMenu);
