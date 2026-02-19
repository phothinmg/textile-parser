import type {
  TextileOptions,
  JmlAttrs,
  JmlEl,
  JmlElement,
  JmlNode,
} from "./commonjs";

export class Textile {
  constructor(options?: TextileOptions);
  public jsonml(str: string): JmlNode;
  public html(str: string): string;
  public ml2Html(jsonml: JmlNode): string;
}

export type { TextileOptions, JmlAttrs, JmlEl, JmlElement, JmlNode };
