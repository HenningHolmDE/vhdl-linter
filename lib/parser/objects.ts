import { Position, Range, TextEdit } from 'vscode-languageserver';
import { config } from './config';
import { OLexerToken } from '../lexer';

export class OI implements Position {
  private i_: number;
  constructor(public parent: ObjectBase | OFile, i: number, j?: number) {
    if (typeof j === 'undefined') {
      this.i_ = i;
    } else {
      this.position = {
        line: i,
        character: j,
      };
      this.calcI();
    }
  }
  set i(i: number) {
    this.position = undefined;
    this.i_ = i;
  }
  get i() {
    return this.i_;
  }
  private position?: Position;
  get line() {
    if (!this.position) {
      this.position = this.calcPosition();
    }
    return this.position.line;
  }
  set line(line: number) {
    if (!this.position) {
      this.position = this.calcPosition();
    }
    this.position.line = line;
    this.calcI();
  }
  toJSON() {
    if (!this.position) {
      this.position = this.calcPosition();
    }
    return this.position;
  }
  get character() {
    if (!this.position) {
      this.position = this.calcPosition();
    }
    return this.position.character;
  }
  set character(character: number) {
    if (!this.position) {
      this.position = this.calcPosition();
    }
    this.position.character = character;
    this.calcI();
  }
  getRangeToEndLine(): OIRange {
    const start = this.i;
    const text = this.parent instanceof OFile ? this.parent.text : this.parent.getRoot().text;
    let end = text.length;
    const match = /\n/.exec(text.substr(start));
    if (match) {
      end = start + match.index;
    }
    return new OIRange(this.parent, start, end);

  }
  private calcPosition(): Position {
    const lines = (this.parent instanceof OFile ? this.parent : this.parent.getRoot()).text.slice(0, this.i).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;
    return { character, line };
  }
  private calcI() {
    if (typeof this.position === 'undefined') {
      throw new Error('Something went wrong with OIRange');
    }
    const lines = (this.parent instanceof OFile ? this.parent : this.parent.getRoot()).text.split('\n');
    this.i_ = lines.slice(0, this.position.line).join('\n').length + 1 + Math.min(this.position.character, lines[this.position.line].length);
  }
}
export class OIRange implements Range {
  public start: OI;
  public end: OI;
  constructor(public parent: ObjectBase | OFile, start: number | OI, end: number | OI) {
    if (start instanceof OI) {
      this.start = start;
    } else {
      this.start = new OI(parent, start);
    }
    if (end instanceof OI) {
      this.end = end;
    } else {
      this.end = new OI(parent, end);
    }
  }
  setEndBacktraceWhitespace(i: number) {
    this.end.i = i - 1;
    const text = this.parent instanceof OFile ? this.parent.text : this.parent.getRoot().text;
    while (text[this.end.i].match(/\s/)) {
      this.end.i--;
    }
  }
  toJSON() {
    return Range.create(this.start, this.end);
  }
  getLimitedRange(limit = 5) {
    const newEnd = this.end.line - this.start.line > limit ?
      new OI(this.parent, this.start.line + limit, Number.POSITIVE_INFINITY)
      : this.end;
    return new OIRange(this.parent, this.start, newEnd);
  }
  getStartAtBeginngOfColumn() {
    const lines = (this.parent instanceof OFile ? this.parent : this.parent.getRoot()).text.split('\n');
    let startCol = 0;
    const match = lines[this.start.line].match(/\S/);
    if (match) {
      startCol = match.index ?? 0;
    }
    const newStart = new OI(this.parent, this.start.line, startCol);

    return new OIRange(this.parent, newStart, this.end);

  }
}

export class ObjectBase {
  name?: OName;
  public range: OIRange;
  constructor(public parent: ObjectBase | OFile, startI: number, endI: number) {
    this.range = new OIRange(this, startI, endI);
    let maximumIterationCounter = 5000;
    let p = parent;
    while (!(p instanceof OFile)) {
      p = p.parent;
      maximumIterationCounter--;
      if (maximumIterationCounter === 0) {
        throw new ParserError('Maximum Iteraction Counter overrung', new OIRange(parent, startI, endI));
      }
    }
    p.objectList.push(this);
  }
  private root?: OFile;
  getRoot(): OFile {
    if (this.root) {
      return this.root;
    }
    let parent: any = this;
    while (parent instanceof OFile === false) {
      parent = parent.parent;
    }
    this.root = parent;
    return parent;
  }
  private rootElement?: OArchitecture | OEntity | OPackage | OPackageBody;

  getRootElement(): OArchitecture | OEntity | OPackage | OPackageBody {
    if (this.rootElement) {
      return this.rootElement;
    }
    let parent: any = this;
    while (parent instanceof OArchitecture === false
      && parent instanceof OEntity && parent instanceof OPackage && parent instanceof OPackageBody) {
      parent = parent.parent;
      if (parent instanceof OFile) {
        throw new ParserError('Failed to find root element', this.range);
      }
    }
    this.rootElement = parent;
    return parent;
  }
  nameEquals(other: ObjectBase) {
    return this.name?.text?.toLowerCase() === other?.name?.text?.toLowerCase();
  }
}
export interface IHasUseClauses {
  useClauses: OUseClause[];
}
export interface IHasName {
  name: OName;
}
export function implementsIHasUseClause(obj: unknown): obj is IHasUseClauses {
  return (obj as IHasUseClauses).useClauses !== undefined;
}
export function implementsIHasName(obj: unknown): obj is IHasName {
  return (obj as IHasName).name !== undefined;
}
export interface IHasContextReference {
  contextReferences: OContextReference[];
}
export function implementsIHasContextReference(obj: unknown): obj is IHasContextReference {
  return (obj as IHasContextReference).contextReferences !== undefined;
}
export interface IReferenceable {
  references: OToken[];
}
export function implementsIMentionable(obj: unknown): obj is IReferenceable {
  return (obj as IReferenceable).references !== undefined;
}
export interface IHasDefinitions {
  definitions: ObjectBase[];
}
export function implementsIHasDefinitions(obj: unknown): obj is IHasDefinitions {
  return (obj as IHasDefinitions).definitions !== undefined;
}
export interface IHasSubprograms {
  subprograms: OSubprogram[];
}
export function implementsIHasSubprograms(obj: unknown): obj is IHasSubprograms {
  return (obj as IHasSubprograms).subprograms !== undefined;
}
export interface IHasTypes {
  types: OType[];
}
export function implementsIHasTypes(obj: unknown): obj is IHasTypes {
  return (obj as IHasTypes).types !== undefined;
}
export interface IHasComponents {
  components: OComponent[];
}
export function implementsIHasComponents(obj: unknown): obj is IHasComponents {
  return (obj as IHasComponents).components !== undefined;
}
export interface IHasInstantiations {
  instantiations: OInstantiation[];
}
export function implementsIHasInstantiations(obj: unknown): obj is IHasInstantiations {
  return (obj as IHasInstantiations).instantiations !== undefined;
}
export interface IHasSignals {
  signals: OSignal[];
}
export interface IHasFileVariables {
  files: OFileVariable[];
}
export function implementsIHasFileVariables(obj: unknown): obj is IHasFileVariables {
  return (obj as IHasFileVariables).files !== undefined;
}
export function implementsIHasSignals(obj: unknown): obj is IHasSignals {
  return (obj as IHasSignals).signals !== undefined;
}
export interface IHasConstants {
  constants: OConstant[];
}
export function implementsIHasConstants(obj: unknown): obj is IHasConstants {
  return (obj as IHasConstants).constants !== undefined;
}
export interface IHasVariables {
  variables: OVariable[];
}
export function implementsIHasVariables(obj: unknown): obj is IHasVariables {
  return (obj as IHasVariables).variables !== undefined;
}
export class OFile {
  constructor(public text: string, public file: string, public originalText: string) { }
  libraries: string[] = [];

  objectList: ObjectBase[] = [];
  contexts: OContext[] = [];
  magicComments: (OMagicCommentParameter | OMagicCommentDisable | OMagicCommentTodo)[] = [];
  entities: OEntity[] = [];
  architectures: OArchitecture[] = [];
  packages: (OPackage | OPackageBody)[] = [];
  configurations: OConfiguration[] = [];
  getJSON() {
    const obj = {};
    const seen = new WeakSet();

    return JSON.stringify(this, (key, value) => {
      if (['parent', 'originalText', 'objectList', 'root'].indexOf(key) > -1) {
        return;
      }
      // text of file
      if (typeof value === 'string' && value.length > 1000) {
        return;
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return;
        }
        value.proto = value.constructor.name;
        seen.add(value);
      }
      return value;
    });
  }
}

export class OPackage extends ObjectBase implements IHasSubprograms, IHasComponents, IHasSignals, IHasConstants,
  IHasVariables, IHasTypes, IHasFileVariables, IHasUseClauses, IHasContextReference, IHasName {
  parent: OFile;
  name: OName;
  useClauses: OUseClause[] = [];
  contextReferences: OContextReference[] = [];
  uninstantiatedPackageName?: OName;
  subprograms: OSubprogram[] = [];
  components: OComponent[] = [];
  signals: OSignal[] = [];
  constants: OConstant[] = [];
  variables: OVariable[] = [];
  files: OFileVariable[] = [];
  types: OType[] = [];
  genericRange?: OIRange;
  generics: OGeneric[] = [];
  genericAssociationList?: OGenericAssociationList;
  library?: string;
}

export class OPackageBody extends ObjectBase implements IHasSubprograms, IHasConstants, IHasVariables, IHasTypes,
  IHasFileVariables, IHasUseClauses, IHasContextReference, IHasName {
  name: OName;
  useClauses: OUseClause[] = [];
  contextReferences: OContextReference[] = [];
  parent: OFile;
  subprograms: OSubprogram[] = [];
  constants: OConstant[] = [];
  variables: OVariable[] = [];
  types: OType[] = [];
  files: OFileVariable[] = [];
  library?: string;
}
export class OUseClause extends ObjectBase {
  constructor(public parent: OFile | OContext, startI: number, endI: number, public library: string, public packageName: string, public suffix: string) {
    super(parent, startI, endI);
  }
}

export class OContextReference extends ObjectBase {
  constructor(public parent: OFile | OContext, startI: number, endI: number, public library: string, public contextName: string) {
    super(parent, startI, endI);
  }
}
export class OContext extends ObjectBase implements IHasUseClauses, IHasContextReference {
  parent: OFile;
  name: OName;
  useClauses: OUseClause[] = [];
  contextReferences: OContextReference[] = [];
  libraries: string[] = [];
}
export type OConcurrentStatements = OProcess | OInstantiation | OIfGenerate | OForGenerate | OBlock | OAssignment;
export class OHasConcurrentStatements extends ObjectBase {
}

export class OArchitecture extends ObjectBase implements IHasSubprograms, IHasComponents, IHasInstantiations,
  IHasSignals, IHasConstants, IHasVariables, IHasTypes, IHasFileVariables, IHasUseClauses, IHasContextReference {
  name: OName;
  useClauses: OUseClause[] = [];
  contextReferences: OContextReference[] = [];

  signals: OSignal[] = [];
  constants: OConstant[] = [];
  variables: OVariable[] = [];
  files: OFileVariable[] = [];
  types: OType[] = [];
  subprograms: OSubprogram[] = [];
  components: OComponent[] = [];
  statements: OConcurrentStatements[] = [];
  entityName?: string;
  correspondingEntity?: OEntity;
  endOfDeclarativePart?: OI;
  get processes() {
    return this.statements.filter(s => s instanceof OProcess) as OProcess[];
  }
  get instantiations() {
    return this.statements.filter(s => s instanceof OInstantiation) as OInstantiation[];
  }
  get ifGenerates() {
    return this.statements.filter(s => s instanceof OIfGenerate) as OIfGenerate[];
  }
  get forGenerates() {
    return this.statements.filter(s => s instanceof OForGenerate) as OForGenerate[];
  }
  get blocks() {
    return this.statements.filter(s => s instanceof OBlock) as OBlock[];
  }
  get assignments() {
    return this.statements.filter(s => s instanceof OAssignment) as OAssignment[];
  }

  get generates() {
    const generates = this.forGenerates as OArchitecture[];
    for (const ifObj of this.ifGenerates) {
      generates.push(...ifObj.ifGenerates);
      if (ifObj.elseGenerate) {
        generates.push(ifObj.elseGenerate);
      }
    }
    return generates as readonly OArchitecture[];
  }
}
export class OBlock extends OArchitecture {
  label: string;

}
export class OType extends ObjectBase implements IReferenceable, IHasSubprograms, IHasSignals, IHasConstants, IHasVariables,
  IHasTypes, IHasFileVariables, IHasUseClauses, IHasName {
  useClauses: OUseClause[] = [];

  types: OType[] = [];
  subprograms: OSubprogram[] = [];
  variables: OVariable[] = [];
  constants: OConstant[] = [];
  signals: OSignal[] = [];
  files: OFileVariable[] = [];
  references: OToken[] = [];
  units?: string[] = [];
  reads: ORead[] = [];
  alias: boolean = false;
  name: OName;
  addReadsToMap(map: Map<String, ObjectBase>) {
    map.set(this.name.text.toLowerCase(), this);

    if (this.units) {
      for (const unit of this.units) {
        map.set(unit.toLowerCase(), this);

      }
    }
    if (this instanceof OEnum) {
      for (const state of this.literals) {
        map.set(state.name.text.toLowerCase(), state);
      }
    } else if (this instanceof ORecord) {
      for (const child of this.children) {
        map.set(child.name.text.toLowerCase(), child);
      }
    }
    for (const subprogram of this.subprograms) {
      map.set(subprogram.name.text.toLowerCase(), subprogram);
    }
  }
}
export class OSubType extends OType {
  superType: ORead;
  reads: ORead[] = [];
}
export class OEnum extends OType {
  literals: OEnumLiteral[] = [];
}
export class ORecord extends OType {
  children: ORecordChild[] = [];
}
export class ORecordChild extends OType {
  public parent: ORecord;
}
export class OEnumLiteral extends ObjectBase implements IReferenceable, IHasName {
  references: OToken[] = [];
  public parent: OEnum;
  public name: OName;

}
export class OForGenerate extends OArchitecture {
  constructor(public parent: OArchitecture,
    startI: number,
    endI: number,
    public variableRange: ORead[],
  ) {
    super(parent, startI, endI);
  }
}
export class OCaseGenerate extends ObjectBase {
  signal: ORead[] = [];
  whenGenerates: OWhenGenerateClause[] = [];
}
export class OWhenGenerateClause extends OArchitecture {
  condition: ORead[] = [];
  public parent: OCaseGenerate;
}
export class OIfGenerate extends ObjectBase {
  ifGenerates: OIfGenerateClause[] = [];
  elseGenerate: OElseGenerateClause;
}
export class OIfGenerateClause extends OArchitecture {
  conditions: OLexerToken[] = [];
  conditionReads: ORead[] = [];
  public parent: OIfGenerate;
}
export class OElseGenerateClause extends OArchitecture {
  public parent: OIfGenerate;

}

export class OName extends ObjectBase {
  text: string;
  public parent: ObjectBase;
  toString() {
    return this.text;
  }
}
export abstract class OVariableBase extends ObjectBase implements IReferenceable, IHasName {
  references: OToken[] = [];
  type: ORead[] = [];
  defaultValue?: ORead[] = [];
  name: OName;

}
export abstract class OSignalBase extends OVariableBase {
  registerProcess?: OProcess;
  constructor(public parent: ObjectBase, startI: number, endI: number) {
    super(parent, startI, endI);
    let pos = new OIRange(parent, startI, endI);
    if (config.debug) {
      console.log(`${this.constructor.name}:   at ${pos.start.line}:${pos.start.character})`);
    }

    let maximumIterationCounter = 5000;
    let p: ObjectBase | OFile = parent;
    while (p instanceof ObjectBase) {
      if (p instanceof OProcess && p.registerProcess) {
        this.registerProcess = p;
        break;
      }
      p = p.parent;
      maximumIterationCounter--;
      if (maximumIterationCounter === 0) {
        throw new ParserError('Maximum Iteraction Counter overrung', new OIRange(parent, startI, endI));

      }
    }
  }
}
export class OFileVariable extends OVariableBase {
  constructor(parent: IHasFileVariables, startI: number, endI: number) {
    super((parent as unknown) as ObjectBase, startI, endI);
  }
  type: ORead[] = [];
}
export class OVariable extends OVariableBase {
  constructor(parent: IHasVariables, startI: number, endI: number) {
    super((parent as unknown) as ObjectBase, startI, endI);
  }
  type: ORead[] = [];
}
export class OSignal extends OSignalBase {
  constructor(parent: IHasSignals, startI: number, endI: number) {
    super((parent as unknown) as ObjectBase, startI, endI);
  }
}
export class OConstant extends OSignalBase {
  constructor(parent: IHasConstants, startI: number, endI: number) {
    super((parent as unknown) as ObjectBase, startI, endI);
  }
}
export class OAssociationList extends ObjectBase {
  constructor(public parent: OInstantiation | OPackage, startI: number, endI: number) {
    super(parent, startI, endI);
  }
  public children: OAssociation[] = [];

}
export class OGenericAssociationList extends OAssociationList {
  constructor(public parent: OInstantiation | OPackage, startI: number, endI: number) {
    super(parent, startI, endI);
  }
}
export class OPortAssociationList extends OAssociationList {
  constructor(public parent: OInstantiation | OPackage, startI: number, endI: number) {
    super(parent, startI, endI);
  }
}
export class OInstantiation extends ObjectBase implements IHasDefinitions {
  constructor(public parent: OArchitecture | OEntity | OProcess | OLoop | OIf, startI: number, endI: number, public type: 'entity' | 'component' | 'configuration' | 'subprogram' | 'unknown' = 'unknown') {
    super(parent, startI, endI);
  }
  label?: string;
  definitions: (OEntity | OSubprogram | OComponent)[] = [];
  componentName: OName;
  package?: OName;
  portAssociationList?: OPortAssociationList;
  genericAssociationList?: OGenericAssociationList;
  library?: string;
  private flatReads: ORead[] | null = null;
  private flatWrites: OWrite[] | null = null;
  getFlatReads(entity: OEntity | undefined): ORead[] {

    if (this.flatReads !== null) {
      return this.flatReads;
    }
    this.flatReads = [];
    if (this.portAssociationList) {
      for (const portAssociation of this.portAssociationList.children) {
        if (entity) {
          const entityPort = entity.ports.find(port => {
            for (const part of portAssociation.formalPart) {
              if (part.text.toLowerCase() === port.name.text.toLowerCase()) {
                return true;
              }
            }
            return false;
          });
          if (entityPort && (entityPort.direction === 'in')) {
            this.flatReads.push(...portAssociation.actualIfInput);
          } else if (entityPort && (entityPort.direction === 'inout')) {
            this.flatReads.push(...portAssociation.actualIfInoutput[0]);
          } else if (entityPort && entityPort.direction === 'out') {
            this.flatReads.push(...portAssociation.actualIfOutput[0]);
          }
        } else {
          this.flatReads.push(...portAssociation.actualIfInput);
        }
      }
    }
    if (this.genericAssociationList) {
      for (const association of this.genericAssociationList.children) {
        this.flatReads.push(...association.actualIfInput);
      }
    }
    return this.flatReads;
  }
  getFlatWrites(entity: OEntity | undefined): OWrite[] {
    //     console.log(entity, 'asd');
    if (this.flatWrites !== null) {
      return this.flatWrites;
    }
    this.flatWrites = [];
    if (this.portAssociationList) {
      for (const association of this.portAssociationList.children) {
        if (entity) {
          const entityPort = entity.ports.find(port => {
            for (const part of association.formalPart) {
              if (part.text.toLowerCase() === port.name.text.toLowerCase()) {
                return true;
              }
            }
            return false;
          });
          if (entityPort && (entityPort.direction === 'out')) {
            this.flatWrites.push(...association.actualIfOutput[1]);
          } else if (entityPort && (entityPort.direction === 'inout')) {
            this.flatWrites.push(...association.actualIfInoutput[1]);
          }
        } else {
          this.flatWrites.push(...association.actualIfInput);
        }
      }
    }
    return this.flatWrites;
  }
}
export class OAssociation extends ObjectBase implements IHasDefinitions {
  constructor(public parent: OAssociationList, startI: number, endI: number) {
    super(parent, startI, endI);
  }
  definitions: (OPort | OGeneric)[] = [];
  formalPart: OAssociationFormal[] = [];
  actualIfInput: ORead[] = [];
  actualIfOutput: [ORead[], OWrite[]] = [[], []];
  actualIfInoutput: [ORead[], OWrite[]] = [[], []];
}
export class OEntity extends ObjectBase implements IHasDefinitions, IHasSubprograms, IHasSignals, IHasConstants, IHasVariables,
  IHasTypes, IHasFileVariables, IHasUseClauses, IHasContextReference, IHasName {
  constructor(public parent: OFile, startI: number, endI: number, public library?: string) {
    super(parent, startI, endI);
  }
  name: OName;
  useClauses: OUseClause[] = [];
  contextReferences: OContextReference[] = [];
  portRange?: OIRange;
  genericRange?: OIRange;
  ports: OPort[] = [];
  generics: OGeneric[] = [];
  signals: OSignal[] = [];
  constants: OConstant[] = [];
  variables: OVariable[] = [];
  subprograms: OSubprogram[] = [];
  types: OType[] = [];
  statements: (OProcess | OAssignment)[] = [];
  definitions: OEntity[] = [];
  files: OFileVariable[] = [];
}
export class OComponent extends ObjectBase implements IHasDefinitions, IHasSubprograms, IHasName {
  constructor(parent: IHasComponents, startI: number, endI: number) {
    super((parent as unknown) as ObjectBase, startI, endI);
  }
  name: OName;
  subprograms: OSubprogram[] = [];
  portRange?: OIRange;
  genericRange?: OIRange;
  ports: OPort[] = [];
  generics: OGeneric[] = [];
  references: OInstantiation[] = [];
  definitions: OEntity[] = [];
}
export class OPort extends OSignalBase implements IHasDefinitions, IHasName {
  direction: 'in' | 'out' | 'inout';
  directionRange: OIRange;
  definitions: OPort[] = [];
  name: OName;
}
export class OGeneric extends OVariableBase implements IHasDefinitions {
  type: ORead[] = [];
  defaultValue?: ORead[] = [];
  reads: ORead[] = [];
  definitions: OGeneric[] = [];
}
export type OSequentialStatement = OCase | OAssignment | OIf | OLoop | OInstantiation | OReport | OAssertion;
export class OIf extends ObjectBase {
  clauses: OIfClause[] = [];
  else?: OElseClause;
}
export class OHasSequentialStatements extends ObjectBase implements IHasInstantiations {
  statements: OSequentialStatement[] = [];
  get cases() {
    return this.statements.filter(s => s instanceof OCase) as OCase[];
  }
  get assignments() {
    return this.statements.filter(s => s instanceof OAssignment) as OAssignment[];
  }
  get ifs() {
    return this.statements.filter(s => s instanceof OIf) as OIf[];
  }
  get loops() {
    return this.statements.filter(s => s instanceof OLoop) as OLoop[];
  }
  get instantiations() {
    return this.statements.filter(s => s instanceof OInstantiation) as OInstantiation[];
  }
}
export class OElseClause extends OHasSequentialStatements {
}
export class OIfClause extends OHasSequentialStatements implements IHasInstantiations {
  condition: OLexerToken[];
  conditionReads: ORead[] = [];
}
export class OCase extends ObjectBase {
  variable: ORead[] = [];
  whenClauses: OWhenClause[] = [];
}
export class OWhenClause extends OHasSequentialStatements implements IHasInstantiations {
  condition: ORead[] = [];
}
export class OProcess extends OHasSequentialStatements implements IHasSubprograms, IHasInstantiations, IHasConstants, IHasVariables,
  IHasTypes, IHasFileVariables, IHasUseClauses {
  useClauses: OUseClause[] = [];
  sensitivityList: ORead[] = [];
  label?: string;
  types: OType[] = [];
  subprograms: OSubprogram[] = [];
  variables: OVariable[] = [];
  files: OFileVariable[] = [];
  constants: OConstant[] = [];
  resetClause?: OIfClause;
  registerProcess: boolean = false;
  private resets: string[] | null = null;
  getResets(): string[] {
    if (this.resets !== null) {
      return this.resets;
    }
    this.resets = [];
    if (!this.registerProcess) {
      return this.resets;
    }
    for (const assignments of this.resetClause?.assignments ?? []) {
      this.resets.push(...assignments.writes.map(write => write.text));
    }
    return this.resets;
  }
}

export class OLoop extends OHasSequentialStatements implements IHasInstantiations {
}
export class OForLoop extends OLoop implements IHasConstants {
  constants: OConstant[] = [];
  constantRange: ORead[] = [];
}
export class OWhileLoop extends OLoop {
  conditionReads: ORead[] = [];
}
export class OAssignment extends ObjectBase {
  writes: OWrite[] = [];
  reads: ORead[] = [];
}

export class OReport extends ObjectBase {
  reads: ORead[] = [];
}
export class OAssertion extends ObjectBase {
  reads: ORead[] = [];
}

export class OToken extends ObjectBase implements IHasDefinitions {
  definitions: ObjectBase[] = [];

  public scope?: ObjectBase; // TODO: What is this scope used for?

  constructor(public parent: ObjectBase, startI: number, endI: number, public text: string) {
    super(parent, startI, endI);

  }
  elaborate() {
    let object: (OFile | ObjectBase) = this;
    let lastIteration = false;
    let stop = false;
    const text = this.text;
    do {
      stop = lastIteration;
      if (!lastIteration) {
        object = object.parent;
      }
      if (implementsIHasSignals(object)) {
        for (const signal of object.signals) {
          if (signal.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(signal);
            this.scope = object as ObjectBase;
            signal.references.push(this);
          }
        }
      }
      if (implementsIHasConstants(object)) {
        for (const constant of object.constants) {
          if (constant.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(constant);
            this.scope = object as ObjectBase;
            constant.references.push(this);
          }
        }
      }
      if (implementsIHasSubprograms(object)) {
        for (const subprogram of object.subprograms) {
          if (subprogram.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(subprogram);
            this.scope = object as ObjectBase;
            subprogram.references.push(this);
          }
        }
      }
      if (object instanceof ObjectBase && implementsIHasTypes(object)) {
        for (const type of object.types) {
          if (type.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(type);
            this.scope = object;
            type.references.push(this);
          }
          if (type instanceof OEnum) {
            for (const state of type.literals) {
              if (state.name.text.toLowerCase() === text.toLowerCase()) {
                this.definitions.push(state);
                this.scope = object;
                state.references.push(this);
              }
            }
          }
          if (type instanceof ORecord) {
            for (const child of type.children) {
              if (child.name.text.toLowerCase() === text.toLowerCase()) {
                this.definitions.push(child);
                this.scope = object;
                child.references.push(this);
              }
            }
          }
        }
      }
      if (implementsIHasVariables(object)) {
        for (const variable of object.variables) {
          if (variable.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(variable);
            this.scope = object as ObjectBase;
            variable.references.push(this);
          }
        }
      }
      if (implementsIHasFileVariables(object)) {
        for (const file of object.files) {
          if (file.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(file);
            this.scope = object as ObjectBase;
            file.references.push(this);
          }
        }
      }
      if (object instanceof OSubprogram
        || object instanceof OEntity
        || object instanceof OComponent) {
        for (const port of object.ports) {
          if (port.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(port);
            this.scope = object;
            port.references.push(this);
          }
        }
      }
      if (object instanceof OEntity || object instanceof OComponent || object instanceof OPackage) {
        for (const generic of object.generics) {
          if (generic.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(generic);
            this.scope = object;
            generic.references.push(this);
          }
        }
      }
      // Handling for Attributes e.g. 'INSTANCE_name or 'PATH_NAME
      // TODO: check better if actual Attribute is following
      // Possible entities (objects where attributes are valid):
      /*
        entity ✓
        architecture ✓
        configuration
        procedure✓
        function✓
        package ✓
        type ✓
        subtype ✓
        constant ✓
        signal✓
        variable✓
        component✓
        label
        literal
        units
        group
        file ✓
        property
        sequence
        */
      const relevantTypes = [
        OEntity,
        OArchitecture,
        OSubprogram, // Procedure, Function
        OPackage, OPackageBody,
        OType,
        OSubType,
        OConstant,
        OSignal, OSignalBase,
        OVariable,
        OComponent];
      for (const relevantType of relevantTypes) {
        if (object instanceof relevantType) {
          if (object.name && object.name.text.toLowerCase() === text.toLowerCase()) {
            this.definitions.push(object);
          }
        }

      }
      if (object instanceof OArchitecture && object.correspondingEntity) {
        object = object.correspondingEntity;
        lastIteration = true;
      }
      // if (object instanceof OFile && object.entity) {
      //   object = object.entity;
      //   lastIteration = true;
      // }
    } while (!(object instanceof OFile || stop));
  }
}
export class OWrite extends OToken {
}
export class ORead extends OToken {

}
// Read of Record element or something
export class OElementRead extends ORead {
  constructor(public parent: ObjectBase, startI: number, endI: number, public text: string) {
    super(parent, startI, endI, text);
  }
}
export class OAssociationFormal extends ObjectBase implements IHasDefinitions {
  definitions: (OPort | OGeneric)[] = [];
  constructor(public parent: OAssociation, startI: number, endI: number, public text: string) {
    super(parent, startI, endI);
  }
}
export class ParserError extends Error {
  constructor(message: string, public range: OIRange, public solution?: { message: string, edits: TextEdit[] }) {
    super(message);
  }
}
export enum MagicCommentType {
  Disable,
  Parameter,
  Todo
}
export class OMagicComment extends ObjectBase {
  constructor(public parent: OFile, public commentType: MagicCommentType, range: OIRange) {
    super(parent, range.start.i, range.end.i);
  }
}
export class OMagicCommentDisable extends OMagicComment {
  constructor(public parent: OFile, public commentType: MagicCommentType.Disable, range: OIRange) {
    super(parent, commentType, range);
  }
}
export class OMagicCommentTodo extends OMagicComment {
  public message: string;
  constructor(public parent: OFile, public commentType: MagicCommentType.Todo, range: OIRange, message: string) {
    super(parent, commentType, range);
    this.message = message;
  }
}
export class OMagicCommentParameter extends OMagicComment {
  constructor(public parent: OFile, public commentType: MagicCommentType.Parameter, range: OIRange, public parameter: string[]) {
    super(parent, commentType, range);
  }
}
export class OSubprogram extends OHasSequentialStatements implements IReferenceable, IHasSubprograms, IHasInstantiations, IHasConstants,
  IHasVariables, IHasTypes, IHasFileVariables, IHasUseClauses, IHasName {
  useClauses: OUseClause[] = [];
  parent: OPackage;
  references: OToken[] = [];
  variables: OVariable[] = [];
  files: OFileVariable[] = [];
  constants: OConstant[] = [];
  ports: OPort[] = [];
  types: OType[] = [];
  subprograms: OSubprogram[] = [];
  return: ORead[] = [];
  name: OName;
}
export class OConfiguration extends ObjectBase {
  identifier: OLexerToken;
  entityName: OLexerToken;
}