const escapeStringRegexp = require('escape-string-regexp');
import { ParserError, OWrite, ORead, OI } from './objects';
import { config } from './config';
import { tokenizer } from './tokenizer';


export class ParserBase {
  constructor(protected text: string, protected pos: OI, protected file: string) {

  }
  debug(_message: string) {
    // let pos = this.getPosition();
    if (config.debug) {
//      console.log(`${this.constructor.name}: ${message} at ${pos.line}:${pos.col}, (${this.file})`);
    }
  }
  debugObject(_object: any) {
    // let target: any = {};
    // const filter = (object: any) => {
    //   const target: any = {};
    //   if (!object) {
    //     return;
    //   }
    //   for (const key of Object.keys(object)) {
    //     if (key === 'parent') {
    //       continue;
    //     } else if (Array.isArray(object[key])) {
    //       target[key] = object[key].map(filter);
    //
    //     } else if (typeof object[key] === 'object') {
    //       target[key] = filter(object[key]);
    //     } else {
    //       target[key] = object[key];
    //     }
    //   }
    //   return target;
    // };
    // target = filter(object);
//     console.log(`${this.constructor.name}: ${JSON.stringify(target, null, 2)} in line: ${this.getLine()}, (${this.file})`);
  }
  message(message: string, severity = 'error') {
    if (severity === 'error') {
      throw new ParserError(message + ` in line: ${this.getLine()}`, this.pos);
    } else {
    }
  }
  advanceWhitespace() {
    const match = this.text.substring(this.pos.i).match(/^\s+/);
    if (match) {
      this.pos.i += match[0].length;
    }
    // while (this.text[this.pos.i] && this.text[this.pos.i].match(/\s/)) {
    //   this.pos.i++;
    // }
  }
  reverseWhitespace() {
    while (this.text[this.pos.i - 1] && this.text[this.pos.i - 1].match(/\s/)) {
      this.pos.i--;
    }
  }
  advancePast(search: string | RegExp, options: {allowSemicolon?: boolean, returnMatch?: boolean} = {}) {
    if (typeof options.allowSemicolon === 'undefined') {
      options.allowSemicolon = false;
    }
    if (typeof options.returnMatch === 'undefined') {
      options.returnMatch = false;
    }
    let text = '';
    let searchStart = this.pos;
    if (typeof search === 'string') {
      while (this.text.substr(this.pos.i, search.length).toLowerCase() !== search.toLowerCase()) {
        if (!options.allowSemicolon && this.text[this.pos.i] === ';') {
          throw new ParserError(`could not find ${search} DEBUG-SEMICOLON`, this.pos);
        }
        text += this.text[this.pos.i];
        this.pos.i++;
        if (this.pos.i > this.text.length) {
          throw new ParserError(`could not find ${search}`, searchStart);
        }
      }
      if (options.returnMatch) {
        text += search;
      }
      this.pos.i += search.length;
    } else {
      let match = this.text.substr(this.pos.i).match(search);
      if (match !== null && typeof match.index !== 'undefined') {
        if (!options.allowSemicolon && this.text.substr(this.pos.i, match.index).indexOf(';') > -1) {
          throw new ParserError(`could not find ${search} DEBUG-SEMICOLON`, searchStart);
        }
        // text = match[0];
        if (options.returnMatch) {
          text = this.text.substr(this.pos.i, match.index + match[0].length);
        } else {
          text = this.text.substr(this.pos.i, match.index);
        }
        this.pos.i += match.index + match[0].length;
      } else {
        throw new ParserError(`could not find ${search}`, searchStart);
      }
    }
    this.advanceWhitespace();
    return text.trim();
  }
  advanceBrace() {
    let text = '';
    let braceLevel = 0;
    let quote = false;
    while (this.text[this.pos.i]) {
      if (this.text[this.pos.i] === '"' && this.text[this.pos.i - 1] !== '\\') {
        quote = !quote;
      } else if (this.text[this.pos.i] === '(' && !quote) {
        braceLevel++;
      } else if (this.text[this.pos.i] === ')' && !quote) {
        if (braceLevel > 0) {
          braceLevel--;
        } else {
          this.pos.i++;
          this.advanceWhitespace();
          return text.trim();
        }
      }
      text += this.text[this.pos.i];
      this.pos.i++;
    }
    throw new ParserError(`could not find closing brace`, new OI(this.pos.parent, this.pos.i - text.length));
  }
  advanceSemicolon(braceAware: boolean = false) {
    if (braceAware) {
      let text = '';
      let braceLevel = 0;
      let quote = false;
      while (this.text[this.pos.i]) {
        const match = /["\\();]/.exec(this.text.substring(this.pos.i));
        if (!match) {
          throw new ParserError(`could not find closing brace`, new OI(this.pos.parent, this.pos.i - text.length));
        }
        if (match[0] === '"' && this.text[this.pos.i + match.index - 1] !== '\\') {
          quote = !quote;
        } else if (match[0] === '(' && !quote) {
          braceLevel++;
        } else if (match[0] === ')' && !quote) {
          if (braceLevel > 0) {
            braceLevel--;
          } else {
            throw new ParserError(`unexpected ')'`, new OI(this.pos.parent, this.pos.i - text.length));
          }
        } else if (match[0] === ';' && !quote && braceLevel === 0) {
          text += this.text.substring(this.pos.i, this.pos.i + match.index);
          this.pos.i += match.index + 1;
          this.advanceWhitespace();
          return text.trim();
        }
        text += this.text.substring(this.pos.i, this.pos.i + match.index);
        this.pos.i += match.index + 1;
      }
      throw new ParserError(`could not find closing brace`, new OI(this.pos.parent, this.pos.i - text.length));
    }
    const match = /;/.exec(this.text.substring(this.pos.i));
    if (!match) {
      throw new ParserError(`could not find semicolon`, this.pos);
    }
    const text = this.text.substring(this.pos.i, this.pos.i + match.index);
    this.pos.i += match.index + 1;
    this.advanceWhitespace();
    return text;
  }
  getNextWord(options: { re?: RegExp, consume?: boolean} = {}) {
    let { re, consume } = options;
    if (!re) {
      re = /^\w+/;
    }
    if (typeof consume === 'undefined') {
      consume = true;
    }

    if (consume) {
      let word = '';
      const match = this.text.substring(this.pos.i).match(re);
      if (match) {
        word = match[0];
        this.pos.i += word.length;
        this.advanceWhitespace();
        return word;
      }
      throw new ParserError(`did not find ${re}. EOF line: ${this.getLine()}`, this.pos);
    }
    let word = '';
    let j = 0;
    while (this.text[this.pos.i + j].match(re)) {
      word += this.text[this.pos.i + j];
      j++;
    }
    return word;
  }

  getLine(position?: number) {
    if (!position) {
      position = this.pos.i;
    }
    let line = 1;
    for (let counter = 0; counter < position; counter++) {
      if (this.text[counter] === '\n') {
        line++;
      }
    }
    return line;
  }
  getEndOfLineI(position?: number) {
    if (!position) {
      position = this.pos.i;
    }
    while (this.text[position] !== '\n') {
      position++;
    }
    return position - 1;
  }
  getPosition(position?: number) {
    if (!position) {
      position = this.pos.i;
    }
    let line = 1;
    let col = 1;
    for (let counter = 0; counter < position; counter++) {
      col++;
      if (this.text[counter] === '\n') {
        line++;
        col = 1;
      }
    }
    return {line, col};
  }
  expect(expected: string | string[]) {
    if (!Array.isArray(expected)) {
      expected = [expected];
    }
    let savedI: number;
    const re = new RegExp('^' + expected.map(e => escapeStringRegexp(e)).join('|'), 'i');
    // console.log(re);
    const match = re.exec(this.text.substr(this.pos.i));
    if (match !== null) {
      this.pos.i += match[0].length;
      savedI = this.pos.i;
      this.advanceWhitespace();
    } else {
      throw new ParserError(`expected '${expected.join(', ')}' found '${this.getNextWord()}' line: ${this.getLine()}`, this.pos);
    }
    return savedI;
  }
  maybeWord(expected: string) {
    const word = this.text.substr(this.pos.i, expected.length);
    if (word.toLowerCase() === expected.toLowerCase()) {
      this.pos.i += word.length;
      this.advanceWhitespace();
    }
  }
  getType(advanceSemicolon = true) {
    let type = '';
    while (this.text[this.pos.i].match(/[^;]/)) {
      type += this.text[this.pos.i];
      this.pos.i++;
    }
    if (advanceSemicolon) {
      this.expect(';');
      this.advanceWhitespace();
    }
    return type;
  }
  extractReads(parent: any, text: string, i: number): ORead[] {
    return tokenizer.tokenize(text).filter(token => token.type === 'VARIABLE' || token.type === 'FUNCTION').map(token => {
      const write = new ORead(parent, i + token.offset, i + token.offset + token.value.length);
      write.text = token.value;
      return write;
    });
  }
  extractReadsOrWrite(parent: any, text: string, i: number): [ORead[], OWrite[]] {
    const reads: ORead[] = [];
    const writes: OWrite[] = [];
    let braceLevel = 0;
    const tokens = tokenizer.tokenize(text);
    let index = 0;
    for (const token of tokens) {
      // console.log(index, token);
      if (token.type === 'BRACE' && index > 0) {
        token.value === '(' ? braceLevel++ : braceLevel--;
      } else if (token.type === 'VARIABLE' || token.type === 'FUNCTION') {
        if (braceLevel === 0) {
          const write = new OWrite(parent, i + token.offset, i + token.offset + token.value.length);
          write.text = token.value;
          writes.push(write);
        } else {
          const read = new ORead(parent, i + token.offset, i + token.offset + token.value.length);
          read.text = token.value;
          reads.push(read);
        }
      }
      if (token.type !== 'WHITESPACE') {
        index++;
      }
    }
    return [reads, writes];
  }
}
