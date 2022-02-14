import { ParserBase } from './parser-base';
import { OSignal, OType, OArchitecture, OEntity, ParserError, OState, OFunction, OPackage, ORecord, OEnum, ORead, OI, ORecordChild, OName, OProcedure, OPackageBody, OProcess, OVariable } from './objects';
import { SubtypeParser } from './subtype-parser';
import { ProcedureParser } from './procedure-parser';
import { EntityParser } from './entity-parser';

export class DeclarativePartParser extends ParserBase {
  type: string;
  constructor(text: string, pos: OI, file: string, private parent: OArchitecture | OEntity | OPackage | OPackageBody | OProcess | OProcedure) {
    super(text, pos, file);
    this.debug('start');
  }
  parse(optional: boolean = false, lastWord = 'begin') {
    const canHaveSignal = !(this.parent instanceof OProcess || this.parent instanceof OProcedure);
    let nextWord = this.getNextWord({ consume: false }).toLowerCase();
    while (nextWord !== lastWord) {
      if ((nextWord === 'signal' && canHaveSignal)
       || nextWord === 'constant'
       || nextWord === 'shared'
       || nextWord === 'variable') {
        if (nextWord === 'shared') {
          this.getNextWord();
        }
        const signals = [];
        const constant = this.getNextWord() === 'constant';
        do {
          this.maybeWord(',');
          const signal = canHaveSignal
            ? new OSignal(this.parent, this.pos.i, this.getEndOfLineI())
            : new OVariable(this.parent, this.pos.i, this.getEndOfLineI());
          signal.constant = constant;
          signal.name = new OName(signal, this.pos.i, this.pos.i);
          signal.name.text = this.getNextWord();
          signal.name.range.end.i = signal.name.range.start.i + signal.name.text.length;
          signals.push(signal);

        } while (this.text[this.pos.i] === ',');
        this.expect(':');
        for (const signal of signals) {
          const { typeReads, defaultValueReads } = this.getType(signal, false);
          signal.type = typeReads;
          signal.defaultValue = defaultValueReads;
          signal.range.end.i = this.pos.i;
        }
        this.advanceSemicolon();
        if (this.parent instanceof OPackage || this.parent instanceof OPackageBody) {
          this.parent.constants.push(...signals as OSignal[]);
        } else if (this.parent instanceof OProcess || this.parent instanceof OProcedure) { //. should be canHaveSignal but linter doesn't like it
          
          this.parent.variables.push(...signals);
        } else {
          this.parent.signals.push(...signals as OSignal[]);
        }
      } else if (nextWord === 'attribute') {
        this.getNextWord();
        this.advanceSemicolon(true);
      } else if (nextWord === 'type') {
        const type = new OType(this.parent, this.pos.i, this.getEndOfLineI());
        this.getNextWord();
        const startTypeName = this.pos.i;
        const typeName = this.getNextWord();
        type.name = new OName(type, startTypeName, startTypeName + typeName.length);
        type.name.text = typeName;
        this.expect('is');
        if (this.text[this.pos.i] === '(') {
          this.expect('(');
          let position = this.pos.i;
          Object.setPrototypeOf(type, OEnum.prototype);
          (type as OEnum).states = this.advancePast(')').split(',').map(stateName => {
            const state = new OState(type, position, this.getEndOfLineI(position));
            const match = stateName.match(/^\s*/);
            if (!match) {
              throw new ParserError(`Error while parsing state`, this.pos.getRangeToEndLine());
            }
            state.range.start.i = position + match[0].length;
            state.name = new OName(state, position + match[0].length, position + match[0].length + stateName.trim().length);
            state.name.text = stateName.trim();
            state.range.end.i = state.range.start.i + state.name.text.length;
            position += stateName.length;
            position++;
            return state;
          });
          type.range.end.i = this.pos.i;
          this.parent.types.push(type);
          this.expect(';');
        } else if (this.test(/^[^;]*units/i)) {
          this.advancePast('units');
          type.units = [];
          type.units.push(this.getNextWord());
          this.advanceSemicolon();
          while (!this.test(/^end\s+units/i)) {
            type.units.push(this.getNextWord());
            this.advanceSemicolon();
          }
          this.expect('end');
          this.expect('units');
          type.range.end.i = this.pos.i;
          this.parent.types.push(type);
          this.expect(';');
        } else {
          const nextWord = this.getNextWord().toLowerCase();
          if (nextWord === 'record') {
            Object.setPrototypeOf(type, ORecord.prototype);
            (type as ORecord).children = [];
            let position = this.pos.i;
            let recordWord = this.getNextWord();
            while (recordWord.toLowerCase() !== 'end') {
              const child = new ORecordChild(type, position, position);
              child.name = new OName(child, position, position + recordWord.length);
              child.name.text = recordWord;
              (type as ORecord).children.push(child);
              this.advanceSemicolon();
              child.range.end.i = this.pos.i;
              position = this.pos.i;
              recordWord = this.getNextWord();
            }
            this.maybeWord('record');
            this.maybeWord(type.name.text);
          } else if (nextWord === 'array') {
            const startI = this.pos.i;
            const match = /;/.exec(this.text.substr(this.pos.i));
            if (!match) {
              throw new ParserError(`could not find semicolon`, this.pos.getRangeToEndLine());
            }
            const text = this.text.substr(this.pos.i, match.index);
            this.pos.i += match.index;
            type.reads.push(...this.extractReads(type, text, startI));
          }
          type.range.end.i = this.pos.i;
          this.parent.types.push(type);
          this.advancePast(';');
        }
      } else if (nextWord === 'subtype') {
        const subtypeParser = new SubtypeParser(this.text, this.pos, this.file, this.parent);

        const type = subtypeParser.parse();
        this.parent.types.push(type);
      } else if (nextWord === 'alias') {
        const type = new OType(this.parent, this.pos.i, this.getEndOfLineI());
        this.getNextWord();
        const startTypeName = this.pos.i;
        const typeName = this.getNextWord();
        type.name = new OName(type, startTypeName, startTypeName + typeName.length + 1);
        type.name.text = typeName;
        if (this.text[this.pos.i] === ':') {
          this.pos.i++;
          this.advanceWhitespace();
          const startI = this.pos.i;
          const readName = this.getNextWord();
          const { typeReads, defaultValueReads } = this.getType(type, false);
          type.reads.push(...typeReads);
        }
        this.expect('is');
        this.parent.types.push(type);
        this.advanceSemicolon(true);
      } else if (nextWord === 'component') {
        this.getNextWord();
        if (this.parent instanceof OArchitecture) {
          const entityParser = new EntityParser(this.text, this.pos, this.file, this.parent);
          this.parent.components.push(entityParser.parse());
        } else {
          const componentName = this.getNextWord();
          this.advancePast(/\bend\b/i, { allowSemicolon: true });
          this.maybeWord('component');
          this.maybeWord(componentName);
          this.expect(';');
        }
      } else if (nextWord === 'procedure') {
        this.getNextWord();
        const procedureParser = new ProcedureParser(this.text, this.pos, this.file, this.parent);
        this.parent.procedures.push(procedureParser.parse(this.pos.i));
      } else if (nextWord === 'impure' || nextWord === 'pure' || nextWord === 'function') {
        if (nextWord === 'impure' || nextWord === 'pure') {
          this.getNextWord();
        }
        const func = new OFunction(this.parent, this.pos.i, this.getEndOfLineI());
        this.getNextWord();
        const startName = this.pos.i;
        const funcName = this.advancePast(/^(\w+|"[^"]+")/, { returnMatch: true }); // .replace(/^"(.*)"$/, '$1');
        func.name = new OName(func, startName, startName + funcName.length + 1);
        func.name.text = funcName;
        if (this.text[this.pos.i] === '(') {
          this.expect('(');
          func.parameter = this.advanceBrace();
        } else {
          func.parameter = '';
        }
        if (!(this.parent instanceof OPackage)) {
          this.advancePast(/\bend\b/i, {allowSemicolon: true});
          let word = this.getNextWord({consume: false});
          while (['case', 'loop', 'if'].indexOf(word.toLowerCase()) > -1) {
            this.advancePast(/\bend\b/i, {allowSemicolon: true});
            word = this.getNextWord({consume: false});
          }
        }
        func.range.end.i = this.pos.i;
        this.advancePast(';');
        this.parent.functions.push(func);
      } else if (nextWord === 'package' || nextWord === 'generic') {
        this.advanceSemicolon();
      } else if (nextWord === 'file') {
        this.advanceSemicolon();
      } else if (nextWord === 'disconnect') {
        this.advanceSemicolon();
      } else if (optional) {
        return;
      }  else {
        throw new ParserError(`Unknown Ding: '${nextWord}' on line ${this.getLine()}`, this.pos.getRangeToEndLine());
      }
      nextWord = this.getNextWord({ consume: false }).toLowerCase();
    }
  }

}
