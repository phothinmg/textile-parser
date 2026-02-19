export type JmlAttrs = Record<string, any>;
export type TagName = import("../tags").Tags;
export type JmlEl = [TagName] | [TagName, JmlAttrs, string] | [TagName, string];
export type JmlElement = [TagName, ...JmlEl[]];
export type JmlNode = [...(string | JmlElement)[]];
export type TextileOptions = {
  breaks?: boolean;
};
export function toHTML(jsonml: JmlNode): string;
export function parseFlow(src: string, options: TextileOptions): JmlNode;
