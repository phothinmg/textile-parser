import { toHTML, parseFlow } from "./esm/index.mjs";

class Textile {
  /**
   *
   * @param {import("./esm/index.mjs").TextileOptions} [options]
   */
  constructor(options) {
    /**
     * @private
     */
    this._opts = options ?? { breaks: true };
  }
  /**
   * @public
   * @param {string} str
   * @returns {import("./esm/index.mjs").JmlNode}
   */
  jsonml(str) {
    return parseFlow(str, this._opts);
  }
  /**
   * @public
   * @param {string} str
   * @returns {string}
   */
  html(str) {
    return this.jsonml(str).map(toHTML).join("");
  }
  /**
   * @public
   * @param {import("./esm/index.mjs").JmlNode} jsonml
   * @returns {string}
   */
  ml2Html(jsonml) {
    return jsonml.map(toHTML).join("");
  }
}

export { Textile };
