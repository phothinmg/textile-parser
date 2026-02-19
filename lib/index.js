"use strict";
const { toHTML, parseFlow } = require("./commonjs/index.js");

class Textile {
  /**
   *
   * @param {import("./commonjs/index").TextileOptions} [options]
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
   * @returns {import("./commonjs/index").JmlNode}
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
   * @param {import("./commonjs/index").JmlNode} jsonml
   * @returns {string}
   */
  ml2Html(jsonml) {
    return jsonml.map(toHTML).join("");
  }
}

exports.Textile = Textile;
