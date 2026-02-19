# textile-parser

## Overview

This package is an extension of [textile-js](https://github.com/borgar/textile-js), a JavaScript library for parsing Textile markup. It builds upon the original work while adding new features and improvements.

## Installation

```bash
npm install textile-parser
```

## Usage

```javascript
const { Textile } = require("textile-parser");

const parser = new Textile();
const textile = "h1. Hello World";

// textile to  html
const html = parser.html(textile);
console.log(html); // <h1>Hello World</h1>

// textile to jsonML

const jsonml = parser.jsonml(textile);
console.log(jsonml); // [ [ 'h1', 'Hello World' ] ]

// jsonML to html

const _html = parser.ml2Html(jsonml);
console.log(_html); // <h1>Hello World</h1>
```

## Documentation

- textile-markup : https://textile-lang.com/
- jsonML : https://www.jsonml.org/
- textile-js : https://github.com/borgar/textile-js/blob/master/README.textile
- Textile live web editor : https://borgar.github.io/textile-js/

## License

Copyright remains with the original author, Borgar Þorsteinsson. This package is licensed under the MIT License.
